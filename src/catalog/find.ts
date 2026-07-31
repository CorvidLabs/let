/**
 * `let find <kind>` — federated catalog query.
 */

import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { LetError } from "../errors.ts";
import { fileBytes, listChildPaths, mtimeMs, pathExists } from "../fs-scan.ts";
import { claudeHome, claudeProjectDir } from "../paths.ts";
import { findAgent3mdAgents, findAgent3mdSkills } from "./agent3md.ts";
import { pathCardId } from "./ids.ts";
import { findInstructions } from "./instructions.ts";
import { federateWorktrees } from "./merge.ts";
import { findSkills } from "./skills.ts";
import type { FindKind, IndexCard } from "./types.ts";

export type FindResult = {
  kind: FindKind;
  scope: string;
  repo_root: string | null;
  items: IndexCard[];
  total: number;
  truncated: boolean;
};

export async function findAssets(
  kind: FindKind,
  ctx: ScanContext,
  opts: { host?: string; query?: string } = {},
): Promise<FindResult> {
  let items: IndexCard[] = [];
  let total = 0;
  let truncated = false;

  switch (kind) {
    case "worktrees": {
      const r = federateWorktrees(ctx);
      items = r.cards;
      total = r.total;
      truncated = r.truncated;
      break;
    }
    case "skills": {
      const r = findSkills(ctx);
      const a3 = findAgent3mdSkills(ctx);
      const merged = [...r.cards, ...a3];
      // re-apply sort: project-local + host + name (findSkills already sorted; concat a3 then sort)
      merged.sort((a, b) => {
        const aLocal = a.scope === "project" ? 0 : 1;
        const bLocal = b.scope === "project" ? 0 : 1;
        if (aLocal !== bLocal) {
          return aLocal - bLocal;
        }
        if (a.host !== b.host) {
          return a.host.localeCompare(b.host);
        }
        return a.name.localeCompare(b.name);
      });
      total = merged.length;
      truncated = total > ctx.limit;
      items = truncated ? merged.slice(0, ctx.limit) : merged;
      break;
    }
    case "instructions": {
      items = findInstructions(ctx);
      total = items.length;
      if (total > ctx.limit) {
        truncated = true;
        items = items.slice(0, ctx.limit);
      }
      break;
    }
    case "sessions": {
      items = findSessions(ctx);
      total = items.length;
      if (total > ctx.limit) {
        truncated = true;
        items = items.slice(0, ctx.limit);
      }
      break;
    }
    case "agents": {
      const partial = findPartialKind("agents", ctx);
      const a3 = findAgent3mdAgents(ctx);
      items = [...a3, ...partial];
      total = items.length;
      if (total > ctx.limit) {
        truncated = true;
        items = items.slice(0, ctx.limit);
      }
      break;
    }
    case "commands":
    case "tasks":
    case "memory":
    case "mcp":
    case "plugins":
    case "workflows":
    case "superskills": {
      // Minimal stubs for local discoverability — empty or partial
      items = findPartialKind(kind, ctx);
      total = items.length;
      if (total > ctx.limit) {
        truncated = true;
        items = items.slice(0, ctx.limit);
      }
      break;
    }
    default:
      throw new LetError("validation", `Unknown kind: ${kind}`, { kind });
  }

  if (opts.host) {
    items = items.filter((c) => c.host === opts.host);
    total = items.length;
    truncated = false;
  }

  if (opts.query) {
    const q = opts.query.toLowerCase();
    items = items.filter((c) => {
      const hay = [c.name, c.description ?? "", c.path, ...(c.triggers ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    total = items.length;
    truncated = false;
  }

  return {
    kind,
    scope: ctx.scope,
    repo_root: ctx.repoRoot,
    items,
    total,
    truncated,
  };
}

function findSessions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  // Claude: ~/.claude/projects/<encoded>/*.jsonl — path-only
  if (ctx.repoRoot && (ctx.scope === "project" || ctx.scope === "all")) {
    const projDir = claudeProjectDir(ctx.repoRoot);
    if (pathExists(projDir)) {
      for (const child of listChildPaths(projDir, ctx.policy)) {
        if (!child.endsWith(".jsonl")) {
          continue;
        }
        cards.push({
          id: pathCardId("sessions", child),
          kind: "sessions",
          host: "claude",
          name: child.split("/").pop() ?? child,
          path: child,
          scope: "project",
          repo_root: ctx.repoRoot,
          mtime_ms: mtimeMs(child),
          meta: {
            bytes: fileBytes(child),
            path_only: true,
          },
        });
      }
    }
  }

  if (ctx.scope === "user" || ctx.scope === "all") {
    // List encoded project dirs only (shallow) — not all jsonl
    const projects = join(claudeHome(), "projects");
    if (pathExists(projects)) {
      for (const dir of listChildPaths(projects, ctx.policy, {
        directoriesOnly: true,
      })) {
        cards.push({
          id: pathCardId("sessions", dir),
          kind: "sessions",
          host: "claude",
          name: dir.split("/").pop() ?? dir,
          path: dir,
          scope: "user",
          meta: { path_only: true, encoded_project: true },
        });
      }
    }
  }

  return cards;
}

function findPartialKind(kind: FindKind, ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  if (!ctx.repoRoot) {
    return cards;
  }

  if (kind === "commands") {
    const dir = join(ctx.repoRoot, ".claude", "commands");
    if (pathExists(dir)) {
      for (const child of listChildPaths(dir, ctx.policy)) {
        cards.push({
          id: pathCardId("commands", child),
          kind: "commands",
          host: "claude",
          name: child.split("/").pop() ?? child,
          path: child,
          scope: "project",
          repo_root: ctx.repoRoot,
          mtime_ms: mtimeMs(child),
        });
      }
    }
  }

  if (kind === "agents") {
    for (const dir of [
      join(ctx.repoRoot, ".claude", "agents"),
      join(claudeHome(), "agents"),
    ]) {
      if (!pathExists(dir)) {
        continue;
      }
      const underRepo = Boolean(ctx.repoRoot && dir.startsWith(ctx.repoRoot));
      if (
        ctx.scope === "project" &&
        !underRepo &&
        !ctx.config.find.include_user_skills
      ) {
        continue;
      }
      for (const child of listChildPaths(dir, ctx.policy)) {
        cards.push({
          id: pathCardId("agents", child),
          kind: "agents",
          host: "claude",
          name: child.split("/").pop() ?? child,
          path: child,
          scope: underRepo ? "project" : "user",
          repo_root: underRepo ? (ctx.repoRoot ?? undefined) : undefined,
          mtime_ms: mtimeMs(child),
        });
      }
    }
  }

  return cards;
}
