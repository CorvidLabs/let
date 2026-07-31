/**
 * Grok Build host adapter — ~/.grok and project .grok.
 * Sessions + memtrace: path-only. Never read auth.json bodies.
 */

import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import {
  fileBytes,
  isDirectory,
  listChildPaths,
  mtimeMs,
  parseSkillFrontmatter,
  pathExists,
  readTextFile,
} from "../fs-scan.ts";
import { safeRealpath } from "../git.ts";
import { grokHome } from "../paths.ts";
import { makeCard } from "./card-factory.ts";
import { skillId } from "./ids.ts";
import { wantProject, wantUser, wantUserGlobal } from "./scope.ts";
import type { IndexCard } from "./types.ts";

/** URL-encode absolute path the way Grok names session dirs. */
export function encodeGrokSessionPath(absolutePath: string): string {
  return encodeURIComponent(absolutePath.replace(/\\/g, "/"));
}

export function findGrokSessions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const sessionsRoot = join(grokHome(), "sessions");
  if (!pathExists(sessionsRoot)) {
    return cards;
  }

  if (wantProject(ctx) && ctx.repoRoot) {
    const rp = safeRealpath(ctx.repoRoot) ?? ctx.repoRoot;
    const encoded = encodeGrokSessionPath(rp);
    const dir = join(sessionsRoot, encoded);
    if (isDirectory(dir)) {
      cards.push(
        makeCard({
          kind: "sessions",
          host: "grok",
          path: dir,
          name: basename(rp),
          scope: "project",
          repoRoot: ctx.repoRoot,
          pathOnly: true,
          meta: {
            source: "grok.sessions",
            encoded_path: encoded,
          },
        }),
      );
      // Individual session files under project dir
      for (const child of listChildPaths(dir, ctx.policy)) {
        if (!child.endsWith(".jsonl") && !isDirectory(child)) {
          continue;
        }
        cards.push(
          makeCard({
            kind: "sessions",
            host: "grok",
            path: child,
            scope: "project",
            repoRoot: ctx.repoRoot,
            pathOnly: true,
            meta: { source: "grok.sessions.file" },
          }),
        );
      }
    }
  }

  if (ctx.scope === "user" || ctx.scope === "all") {
    if (isDirectory(sessionsRoot)) {
      try {
        for (const name of readdirSync(sessionsRoot).slice(
          0,
          ctx.policy.maxEntriesPerRoot,
        )) {
          if (name.startsWith(".") || name.endsWith(".sqlite")) {
            continue;
          }
          const p = join(sessionsRoot, name);
          cards.push(
            makeCard({
              kind: "sessions",
              host: "grok",
              path: p,
              name: decodeURIComponentSafe(name),
              scope: "user",
              pathOnly: true,
              meta: {
                source: "grok.sessions",
                encoded_path: name,
              },
            }),
          );
        }
      } catch {
        // skip
      }
    }
  }

  return cards;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** memtrace jsonl files — path-only memory index (user|all only). */
export function findGrokMemory(ctx: ScanContext): IndexCard[] {
  if (!wantUserGlobal(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const root = join(grokHome(), "memtrace");
  if (!isDirectory(root)) {
    return cards;
  }
  for (const child of listChildPaths(root, ctx.policy)) {
    cards.push(
      makeCard({
        kind: "memory",
        host: "grok",
        path: child,
        scope: "user",
        pathOnly: true,
        meta: {
          source: "grok.memtrace",
          bytes: fileBytes(child),
        },
      }),
    );
  }
  return cards;
}

/** Bundled Grok agent personas under ~/.grok/bundled/agents. */
export function findGrokAgents(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  for (const rel of ["bundled/agents", "agents"]) {
    const dir = join(grokHome(), rel);
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      if (!child.endsWith(".md") && !isDirectory(child)) {
        continue;
      }
      const text = child.endsWith(".md")
        ? readTextFile(child, ctx.policy, 8_000)
        : null;
      const fm = text ? parseSkillFrontmatter(text) : {};
      cards.push(
        makeCard({
          kind: "agents",
          host: "grok",
          path: child,
          name: fm.name ?? basename(child, ".md"),
          description: fm.description,
          scope: "user",
          meta: { source: `grok.${rel}` },
        }),
      );
    }
  }
  // personas / roles as agent-adjacent cards
  for (const rel of ["bundled/personas", "bundled/roles"]) {
    const dir = join(grokHome(), rel);
    if (!isDirectory(dir)) {
      continue;
    }
    cards.push(
      makeCard({
        kind: "agents",
        host: "grok",
        path: dir,
        name: basename(rel),
        scope: "user",
        pathOnly: true,
        meta: { source: `grok.${rel}`, kind: basename(rel) },
      }),
    );
  }
  return cards;
}

/** Workflows if present (project + user). */
export function findGrokWorkflows(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(ctx.repoRoot, ".grok", "workflows"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(grokHome(), "workflows"), scope: "user" });
    roots.push({
      dir: join(grokHome(), "bundled", "workflows"),
      scope: "user",
    });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    if (isDirectory(dir)) {
      for (const child of listChildPaths(dir, ctx.policy)) {
        cards.push(
          makeCard({
            kind: "workflows",
            host: "grok",
            path: child,
            scope,
            repoRoot: scope === "project" ? ctx.repoRoot : null,
            meta: { source: "grok.workflows" },
          }),
        );
      }
    }
  }
  return cards;
}

/** Extra skill roots handled here only if not in skillRoots (personas skills). */
export function findGrokExtraSkills(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  // marketplace-cache skills if any
  const market = join(grokHome(), "marketplace-cache");
  if (!isDirectory(market)) {
    return cards;
  }
  // shallow: each market entry may have skills/
  for (const vendor of listChildPaths(market, ctx.policy, {
    directoriesOnly: true,
  })) {
    const skillsDir = join(vendor, "skills");
    if (!isDirectory(skillsDir)) {
      continue;
    }
    for (const child of listChildPaths(skillsDir, ctx.policy)) {
      let bodyPath = child;
      let name = basename(child);
      if (isDirectory(child)) {
        const md = join(child, "SKILL.md");
        if (!pathExists(md)) {
          continue;
        }
        bodyPath = md;
      } else if (!child.endsWith(".md")) {
        continue;
      } else {
        name = basename(child, ".md");
      }
      const text = readTextFile(bodyPath, ctx.policy, 64_000);
      const fm = text ? parseSkillFrontmatter(text) : {};
      if (fm.name) {
        name = fm.name;
      }
      cards.push({
        id: skillId("grok", name, bodyPath),
        kind: "skills",
        host: "grok",
        name,
        path: bodyPath,
        scope: "user",
        description: fm.description,
        mtime_ms: mtimeMs(bodyPath),
        meta: { source: "grok.marketplace-cache" },
      });
    }
  }
  return cards;
}
