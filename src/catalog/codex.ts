/**
 * Codex host adapter — ~/.codex
 * Sessions/memory path-only; shallow scans only (home can be huge).
 */

import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import {
  fileBytes,
  isDirectory,
  listChildPaths,
  mtimeMs,
  pathExists,
} from "../fs-scan.ts";
import { codexHome } from "../paths.ts";
import { makeCard } from "./card-factory.ts";
import { instructionId, pathCardId } from "./ids.ts";
import { wantUser } from "./scope.ts";
import type { IndexCard } from "./types.ts";

export function findCodexAgents(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const dir = join(codexHome(), "agents");
  if (!pathExists(dir)) {
    return cards;
  }
  for (const child of listChildPaths(dir, ctx.policy)) {
    cards.push(
      makeCard({
        kind: "agents",
        host: "codex",
        path: child,
        name: basename(child).replace(/\.(toml|md)$/, ""),
        scope: "user",
        meta: { source: "codex.agents" },
      }),
    );
  }
  return cards;
}

/**
 * Sessions under ~/.codex/sessions (year/month trees) + archived_sessions.
 * Path-only, shallow: year dirs + first-level children, not full tree dump.
 */
export function findCodexSessions(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx) && ctx.scope !== "all") {
    // codex sessions are user-global; only when user catalogs included
    if (!(ctx.scope === "project" && ctx.config.find.include_user_skills)) {
      return [];
    }
  }
  const cards: IndexCard[] = [];
  const home = codexHome();

  for (const rel of ["sessions", "archived_sessions"]) {
    const root = join(home, rel);
    if (!isDirectory(root)) {
      continue;
    }
    // list top-level (years or files)
    try {
      for (const name of readdirSync(root).slice(
        0,
        ctx.policy.maxEntriesPerRoot,
      )) {
        if (name.startsWith(".")) {
          continue;
        }
        const p = join(root, name);
        if (isDirectory(p)) {
          cards.push(
            makeCard({
              kind: "sessions",
              host: "codex",
              path: p,
              name: `${rel}/${name}`,
              scope: "user",
              pathOnly: true,
              meta: { source: `codex.${rel}`, level: "year_or_bucket" },
            }),
          );
          // one more level (months or rollouts) — still shallow
          for (const child of listChildPaths(p, ctx.policy).slice(0, 50)) {
            cards.push(
              makeCard({
                kind: "sessions",
                host: "codex",
                path: child,
                scope: "user",
                pathOnly: true,
                meta: { source: `codex.${rel}`, level: "child" },
              }),
            );
          }
        } else if (name.endsWith(".jsonl")) {
          cards.push(
            makeCard({
              kind: "sessions",
              host: "codex",
              path: p,
              scope: "user",
              pathOnly: true,
              meta: { source: `codex.${rel}` },
            }),
          );
        }
      }
    } catch {
      // skip
    }
  }
  return cards;
}

export function findCodexPlugins(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const dir = join(codexHome(), "plugins");
  if (!pathExists(dir)) {
    return cards;
  }
  for (const child of listChildPaths(dir, ctx.policy)) {
    cards.push(
      makeCard({
        kind: "plugins",
        host: "codex",
        path: child,
        scope: "user",
        pathOnly: true,
        meta: { source: "codex.plugins" },
      }),
    );
  }
  return cards;
}

/** memories dir + sqlite stores — path-only, never dump DB. */
export function findCodexMemory(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const home = codexHome();

  const memDir = join(home, "memories");
  if (isDirectory(memDir)) {
    cards.push(
      makeCard({
        kind: "memory",
        host: "codex",
        path: memDir,
        name: "memories",
        scope: "user",
        pathOnly: true,
        meta: { source: "codex.memories.dir" },
      }),
    );
    for (const child of listChildPaths(memDir, ctx.policy)) {
      cards.push(
        makeCard({
          kind: "memory",
          host: "codex",
          path: child,
          scope: "user",
          pathOnly: true,
          meta: { source: "codex.memories" },
        }),
      );
    }
  }

  for (const name of ["memories_1.sqlite", "goals_1.sqlite"]) {
    const p = join(home, name);
    if (!pathExists(p)) {
      continue;
    }
    cards.push(
      makeCard({
        kind: "memory",
        host: "codex",
        path: p,
        name,
        scope: "user",
        pathOnly: true,
        meta: {
          source: "codex.sqlite",
          bytes: fileBytes(p),
          note: "sqlite store — metadata only",
        },
      }),
    );
  }
  return cards;
}

/** ~/.codex/AGENTS.md as user instruction. */
export function findCodexInstructions(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const p = join(codexHome(), "AGENTS.md");
  if (!pathExists(p)) {
    return [];
  }
  return [
    {
      id: instructionId(p),
      kind: "instructions",
      host: "codex",
      name: "AGENTS.md",
      path: p,
      scope: "user",
      mtime_ms: mtimeMs(p),
      meta: { global: true, source: "codex.home" },
    },
  ];
}

export function findCodexMcp(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  // config.toml may embed MCP — path-only (can hold secrets)
  const config = join(codexHome(), "config.toml");
  if (pathExists(config)) {
    cards.push({
      id: pathCardId("mcp", config),
      kind: "mcp",
      host: "codex",
      name: "codex-config",
      path: config,
      scope: "user",
      mtime_ms: mtimeMs(config),
      meta: {
        path_only: true,
        source: "codex.config",
        note: "may contain secrets — show metadata-only",
      },
    });
  }
  return cards;
}
