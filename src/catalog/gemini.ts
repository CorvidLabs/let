/**
 * Gemini host adapter — ~/.gemini and project .gemini / GEMINI.md.
 * Sessions/history are path-only; never load oauth or history bodies.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { fileBytes, isDirectory, mtimeMs, pathExists } from "../fs-scan.ts";
import { geminiHome, projectGeminiDir } from "../paths.ts";
import { instructionId, pathCardId } from "./ids.ts";
import type { IndexCard } from "./types.ts";

function readProjectsMap(): Map<string, string> {
  // path -> short name
  const map = new Map<string, string>();
  const p = join(geminiHome(), "projects.json");
  if (!pathExists(p)) {
    return map;
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as {
      projects?: Record<string, string>;
    };
    for (const [path, name] of Object.entries(raw.projects ?? {})) {
      map.set(path, name);
    }
  } catch {
    // ignore
  }
  return map;
}

export function findGeminiInstructions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots = new Set<string>();
  if (ctx.repoRoot) {
    roots.add(ctx.repoRoot);
  }
  roots.add(ctx.cwd);

  for (const root of roots) {
    for (const rel of ["GEMINI.md", ".gemini"]) {
      const p = join(root, rel);
      if (!pathExists(p)) {
        continue;
      }
      cards.push({
        id: instructionId(p),
        kind: "instructions",
        host: "gemini",
        name: rel,
        path: p,
        scope: "project",
        repo_root: ctx.repoRoot ?? undefined,
        mtime_ms: mtimeMs(p),
      });
    }
  }

  // User global GEMINI.md
  if (
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    ctx.config.find.include_user_skills
  ) {
    const globalMd = join(geminiHome(), "GEMINI.md");
    if (pathExists(globalMd)) {
      cards.push({
        id: instructionId(globalMd),
        kind: "instructions",
        host: "gemini",
        name: "GEMINI.md",
        path: globalMd,
        scope: "user",
        mtime_ms: mtimeMs(globalMd),
        meta: { global: true },
      });
    }
  }

  // dedupe path
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.path)) {
      return false;
    }
    seen.add(c.path);
    return true;
  });
}

/**
 * Path-only session/history cards.
 * project scope: history folder bound via projects.json to repoRoot.
 * user|all: list history/* dirs and projects.json entries (no file bodies).
 */
export function findGeminiSessions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const home = geminiHome();
  if (!pathExists(home)) {
    return cards;
  }

  const projects = readProjectsMap();
  const historyRoot = join(home, "history");

  if (ctx.scope === "project" && ctx.repoRoot) {
    const short = projects.get(ctx.repoRoot);
    if (short) {
      const hist = join(historyRoot, short);
      if (pathExists(hist)) {
        cards.push({
          id: pathCardId("sessions", hist),
          kind: "sessions",
          host: "gemini",
          name: short,
          path: hist,
          scope: "project",
          repo_root: ctx.repoRoot,
          mtime_ms: mtimeMs(hist),
          meta: {
            path_only: true,
            kind: "history",
            project_key: short,
          },
        });
      }
    }
    // project-local .gemini
    const local = projectGeminiDir(ctx.repoRoot);
    if (pathExists(local)) {
      cards.push({
        id: pathCardId("sessions", local),
        kind: "sessions",
        host: "gemini",
        name: ".gemini",
        path: local,
        scope: "project",
        repo_root: ctx.repoRoot,
        mtime_ms: mtimeMs(local),
        meta: { path_only: true, kind: "project_dir" },
      });
    }
  }

  if (ctx.scope === "user" || ctx.scope === "all") {
    if (isDirectory(historyRoot)) {
      try {
        for (const name of readdirSync(historyRoot).slice(
          0,
          ctx.policy.maxEntriesPerRoot,
        )) {
          const p = join(historyRoot, name);
          if (!isDirectory(p)) {
            continue;
          }
          cards.push({
            id: pathCardId("sessions", p),
            kind: "sessions",
            host: "gemini",
            name,
            path: p,
            scope: "user",
            mtime_ms: mtimeMs(p),
            meta: { path_only: true, kind: "history" },
          });
        }
      } catch {
        // skip
      }
    }
    // projects.json as index cards (path-only registry)
    for (const [path, name] of projects) {
      cards.push({
        id: pathCardId("sessions", `gemini-project:${path}`),
        kind: "sessions",
        host: "gemini",
        name: `project:${name}`,
        path,
        scope: "user",
        meta: {
          path_only: true,
          kind: "projects_json",
          short_name: name,
        },
      });
    }
  }

  return cards;
}

/** Light agent/mcp discovery under antigravity if present. */
export function findGeminiAgents(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  if (ctx.scope === "project" && !ctx.config.find.include_user_skills) {
    // still allow user agent roots when include_user_skills (same rule as skills)
  }
  const wantUser =
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    (ctx.scope === "project" && ctx.config.find.include_user_skills);

  if (!wantUser) {
    return cards;
  }

  for (const rel of ["antigravity", "antigravity-cli"]) {
    const dir = join(geminiHome(), rel);
    if (!pathExists(dir)) {
      continue;
    }
    cards.push({
      id: pathCardId("agents", dir),
      kind: "agents",
      host: "gemini",
      name: rel,
      path: dir,
      scope: "user",
      mtime_ms: mtimeMs(dir),
      meta: {
        path_only: true,
        bytes: fileBytes(dir),
      },
    });
  }

  const mcp = join(geminiHome(), "antigravity", "mcp_config.json");
  if (pathExists(mcp)) {
    cards.push({
      id: pathCardId("mcp", mcp),
      kind: "mcp",
      host: "gemini",
      name: "mcp_config.json",
      path: mcp,
      scope: "user",
      mtime_ms: mtimeMs(mcp),
      meta: { path_only: true },
    });
  }

  return cards;
}

/** Antigravity brain / knowledge — path-only memory (user|all only). */
export function findGeminiMemory(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  if (ctx.scope !== "user" && ctx.scope !== "all") {
    return cards;
  }
  for (const rel of [
    "antigravity/brain",
    "antigravity/knowledge",
    "antigravity/conversations",
  ]) {
    const dir = join(geminiHome(), rel);
    if (!pathExists(dir)) {
      continue;
    }
    cards.push({
      id: pathCardId("memory", dir),
      kind: "memory",
      host: "gemini",
      name: rel.split("/").pop() ?? rel,
      path: dir,
      scope: "user",
      mtime_ms: mtimeMs(dir),
      meta: {
        path_only: true,
        source: `gemini.${rel}`,
        bytes: fileBytes(dir),
      },
    });
  }
  return cards;
}
