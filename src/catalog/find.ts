/**
 * `let find <kind>` — federated catalog query.
 */

import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { LetError } from "../errors.ts";
import { fileBytes, listChildPaths, mtimeMs, pathExists } from "../fs-scan.ts";
import {
  claudeHome,
  claudeProjectDir,
  codexHome,
  cursorHome,
} from "../paths.ts";
import { findAgent3mdAgents, findAgent3mdSkills } from "./agent3md.ts";
import { findGeminiAgents, findGeminiSessions } from "./gemini.ts";
import { pathCardId } from "./ids.ts";
import { findInstructions } from "./instructions.ts";
import { findKimiAgents, findKimiSessions } from "./kimi.ts";
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

function applyLimit(
  items: IndexCard[],
  limit: number,
): { items: IndexCard[]; total: number; truncated: boolean } {
  const total = items.length;
  const truncated = total > limit;
  return {
    items: truncated ? items.slice(0, limit) : items,
    total,
    truncated,
  };
}

export async function findAssets(
  kind: FindKind,
  ctx: ScanContext,
  opts: { host?: string; query?: string } = {},
): Promise<FindResult> {
  let items: IndexCard[] = [];

  switch (kind) {
    case "worktrees": {
      // federation already applies limit; re-filter below if host/query set
      const r = federateWorktrees(ctx);
      items = r.cards;
      if (!opts.host && !opts.query) {
        return {
          kind,
          scope: ctx.scope,
          repo_root: ctx.repoRoot,
          items: r.cards,
          total: r.total,
          truncated: r.truncated,
        };
      }
      // expand for filter: re-run with high limit
      items = federateWorktrees({ ...ctx, limit: 500 }).cards;
      break;
    }
    case "skills": {
      const r = findSkills({ ...ctx, limit: 500 });
      const a3 = findAgent3mdSkills({ ...ctx, limit: 500 });
      const merged = [...r.cards, ...a3];
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
      items = merged;
      break;
    }
    case "instructions": {
      items = findInstructions(ctx);
      break;
    }
    case "sessions": {
      items = [
        ...findSessions(ctx),
        ...findGeminiSessions(ctx),
        ...findKimiSessions(ctx),
      ];
      break;
    }
    case "agents": {
      const partial = findPartialKind("agents", ctx);
      const a3 = findAgent3mdAgents(ctx);
      const gem = findGeminiAgents(ctx);
      const kimiA = findKimiAgents(ctx);
      items = [...a3, ...partial, ...gem, ...kimiA];
      break;
    }
    case "mcp": {
      items = [
        ...findPartialKind("mcp", ctx),
        ...findGeminiAgents(ctx).filter((c) => c.kind === "mcp"),
      ];
      break;
    }
    case "commands":
    case "tasks":
    case "memory":
    case "plugins":
    case "workflows":
    case "superskills": {
      items = findPartialKind(kind, ctx);
      break;
    }
    default:
      throw new LetError("validation", `Unknown kind: ${kind}`, { kind });
  }

  // Filter before limit so --host kimi is not starved by other hosts
  if (opts.host) {
    items = items.filter((c) => c.host === opts.host);
  }

  if (opts.query) {
    const q = opts.query.toLowerCase();
    items = items.filter((c) => {
      const hay = [c.name, c.description ?? "", c.path, ...(c.triggers ?? [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const limited = applyLimit(items, ctx.limit);
  return {
    kind,
    scope: ctx.scope,
    repo_root: ctx.repoRoot,
    items: limited.items,
    total: limited.total,
    truncated: limited.truncated,
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

  if (kind === "commands" && ctx.repoRoot) {
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
    const agentDirs: { dir: string; host: "claude" | "codex" | "cursor" }[] =
      [];
    if (ctx.repoRoot) {
      agentDirs.push({
        dir: join(ctx.repoRoot, ".claude", "agents"),
        host: "claude",
      });
    }
    agentDirs.push(
      { dir: join(claudeHome(), "agents"), host: "claude" },
      { dir: join(codexHome(), "agents"), host: "codex" },
      { dir: join(cursorHome(), "agents"), host: "cursor" },
    );
    for (const { dir, host } of agentDirs) {
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
      if (ctx.scope === "user" && underRepo) {
        continue;
      }
      for (const child of listChildPaths(dir, ctx.policy)) {
        cards.push({
          id: pathCardId("agents", child),
          kind: "agents",
          host,
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
