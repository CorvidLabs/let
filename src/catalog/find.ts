/**
 * `let find <kind>` — federated catalog query across all hosts.
 * The let standard: one closed kind set, host-neutral IndexCards, progressive disclosure.
 */

import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { LetError } from "../errors.ts";
import { fileBytes, listChildPaths, mtimeMs, pathExists } from "../fs-scan.ts";
import { claudeHome, claudeProjectDir } from "../paths.ts";
import { findAgent3mdAgents, findAgent3mdSkills } from "./agent3md.ts";
import { dedupeCards, sortCards } from "./card-factory.ts";
import {
  findClaudeAgents,
  findClaudeCommands,
  findClaudePlugins,
  findClaudeTasks,
} from "./claude.ts";
import {
  findCodexAgents,
  findCodexMemory,
  findCodexPlugins,
  findCodexSessions,
} from "./codex.ts";
import {
  findCursorAgents,
  findCursorCommands,
  findCursorExtraSkills,
  findCursorSessions,
  findCursorTasks,
} from "./cursor.ts";
import {
  findGeminiAgents,
  findGeminiMemory,
  findGeminiSessions,
} from "./gemini.ts";
import {
  findGrokAgents,
  findGrokExtraSkills,
  findGrokMemory,
  findGrokSessions,
  findGrokWorkflows,
} from "./grok.ts";
import { pathCardId } from "./ids.ts";
import { findInstructions } from "./instructions.ts";
import { findKimiAgents, findKimiMemory, findKimiSessions } from "./kimi.ts";
import {
  findLetAgents,
  findLetMemory,
  findLetSessions,
  findLetSuperskills,
  findLetWorkflows,
} from "./let-assets.ts";
import { findMcpConfigs } from "./mcp.ts";
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

function finalize(items: IndexCard[]): IndexCard[] {
  return sortCards(dedupeCards(items));
}

export async function findAssets(
  kind: FindKind,
  ctx: ScanContext,
  opts: { host?: string; query?: string } = {},
): Promise<FindResult> {
  let items: IndexCard[] = [];

  switch (kind) {
    case "worktrees": {
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
      items = federateWorktrees({ ...ctx, limit: 500 }).cards;
      break;
    }
    case "skills": {
      const r = findSkills({ ...ctx, limit: 500 });
      items = finalize([
        ...r.cards,
        ...findAgent3mdSkills({ ...ctx, limit: 500 }),
        ...findCursorExtraSkills(ctx),
        ...findGrokExtraSkills(ctx),
      ]);
      break;
    }
    case "instructions": {
      items = finalize(findInstructions(ctx));
      break;
    }
    case "sessions": {
      items = finalize([
        ...findClaudeSessions(ctx),
        ...findGrokSessions(ctx),
        ...findCodexSessions(ctx),
        ...findCursorSessions(ctx),
        ...findGeminiSessions(ctx),
        ...findKimiSessions(ctx),
        ...findLetSessions(ctx),
      ]);
      break;
    }
    case "agents": {
      items = finalize([
        ...findAgent3mdAgents(ctx),
        ...findClaudeAgents(ctx),
        ...findCodexAgents(ctx),
        ...findCursorAgents(ctx),
        ...findGrokAgents(ctx),
        ...findGeminiAgents(ctx).filter((c) => c.kind === "agents"),
        ...findKimiAgents(ctx),
        ...findLetAgents(ctx),
      ]);
      break;
    }
    case "commands": {
      items = finalize([
        ...findClaudeCommands(ctx),
        ...findCursorCommands(ctx),
      ]);
      break;
    }
    case "tasks": {
      items = finalize([...findClaudeTasks(ctx), ...findCursorTasks(ctx)]);
      break;
    }
    case "memory": {
      items = finalize([
        ...findGrokMemory(ctx),
        ...findCodexMemory(ctx),
        ...findGeminiMemory(ctx),
        ...findKimiMemory(ctx),
        ...findLetMemory(ctx),
      ]);
      break;
    }
    case "mcp": {
      items = finalize(findMcpConfigs(ctx));
      break;
    }
    case "plugins": {
      items = finalize([...findClaudePlugins(ctx), ...findCodexPlugins(ctx)]);
      break;
    }
    case "workflows": {
      items = finalize([...findGrokWorkflows(ctx), ...findLetWorkflows(ctx)]);
      break;
    }
    case "superskills": {
      items = finalize(findLetSuperskills(ctx));
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

function findClaudeSessions(ctx: ScanContext): IndexCard[] {
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
            source: "claude.projects",
          },
        });
      }
    }
  }

  if (ctx.scope === "user" || ctx.scope === "all") {
    const projects = join(claudeHome(), "projects");
    if (pathExists(projects)) {
      for (const dir of listChildPaths(projects, ctx.policy, {
        directoriesOnly: true,
      })) {
        // Deeper: count jsonl children (path-only; still no bodies)
        let jsonl = 0;
        let latest = mtimeMs(dir);
        for (const child of listChildPaths(dir, ctx.policy)) {
          if (child.endsWith(".jsonl")) {
            jsonl++;
            const m = mtimeMs(child);
            if (m !== undefined && (latest === undefined || m > latest)) {
              latest = m;
            }
          }
        }
        cards.push({
          id: pathCardId("sessions", dir),
          kind: "sessions",
          host: "claude",
          name: dir.split("/").pop() ?? dir,
          path: dir,
          scope: "user",
          mtime_ms: latest,
          meta: {
            path_only: true,
            encoded_project: true,
            source: "claude.projects",
            jsonl_count: jsonl,
          },
        });
      }
    }
    // legacy empty sessions dir marker
    const sess = join(claudeHome(), "sessions");
    if (pathExists(sess)) {
      cards.push({
        id: pathCardId("sessions", sess),
        kind: "sessions",
        host: "claude",
        name: "sessions",
        path: sess,
        scope: "user",
        mtime_ms: mtimeMs(sess),
        meta: { path_only: true, source: "claude.sessions" },
      });
    }
  }

  return cards;
}
