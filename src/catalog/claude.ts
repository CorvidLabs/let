/**
 * Claude Code host adapter — project .claude + ~/.claude.
 * Sessions/tasks: path-only. Never load history.jsonl bodies.
 */

import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import {
  fileBytes,
  isDirectory,
  listChildPaths,
  mtimeMs,
  pathExists,
  readTextFile,
} from "../fs-scan.ts";
import { claudeHome, projectClaudeDir } from "../paths.ts";
import { makeCard } from "./card-factory.ts";
import { pathCardId } from "./ids.ts";
import { wantProject, wantUser } from "./scope.ts";
import type { IndexCard } from "./types.ts";

function projectClaude(ctx: ScanContext): string | null {
  return ctx.repoRoot ? projectClaudeDir(ctx.repoRoot) : null;
}

/** Project + user slash-commands. */
export function findClaudeCommands(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];

  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(ctx.repoRoot, ".claude", "commands"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(claudeHome(), "commands"), scope: "user" });
  }

  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      cards.push(
        makeCard(
          {
            kind: "commands",
            host: "claude",
            path: child,
            scope,
            repoRoot: scope === "project" ? ctx.repoRoot : null,
            meta: { source: "claude.commands" },
          },
          ctx,
        ),
      );
    }
  }
  return cards;
}

/** Project + user agent markdown under .claude/agents. */
export function findClaudeAgents(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];

  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(ctx.repoRoot, ".claude", "agents"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(claudeHome(), "agents"), scope: "user" });
  }

  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      cards.push(
        makeCard(
          {
            kind: "agents",
            host: "claude",
            path: child,
            scope,
            repoRoot: scope === "project" ? ctx.repoRoot : null,
            meta: { source: "claude.agents" },
          },
          ctx,
        ),
      );
    }
  }
  return cards;
}

/**
 * Plugins: installed_plugins.json entries + marketplace / cache dirs (path-only).
 */
export function findClaudePlugins(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const pluginsRoot = join(claudeHome(), "plugins");
  if (!pathExists(pluginsRoot)) {
    return cards;
  }

  // Registry file as one card
  const installed = join(pluginsRoot, "installed_plugins.json");
  if (pathExists(installed)) {
    cards.push(
      makeCard({
        kind: "plugins",
        host: "claude",
        path: installed,
        name: "installed_plugins",
        scope: "user",
        pathOnly: true,
        meta: { source: "claude.plugins.registry" },
      }),
    );
    // Expand install paths from registry when readable
    const text = readTextFile(installed, ctx.policy, 256_000);
    if (text) {
      try {
        const raw = JSON.parse(text) as {
          plugins?: Record<
            string,
            { installPath?: string; version?: string; scope?: string }[]
          >;
        };
        for (const [id, entries] of Object.entries(raw.plugins ?? {})) {
          for (const entry of entries) {
            if (!entry.installPath || !pathExists(entry.installPath)) {
              continue;
            }
            cards.push(
              makeCard({
                kind: "plugins",
                host: "claude",
                path: entry.installPath,
                name: id,
                scope: "user",
                pathOnly: true,
                description: entry.version ? `v${entry.version}` : undefined,
                meta: {
                  source: "claude.plugins.install",
                  plugin_id: id,
                  version: entry.version,
                },
              }),
            );
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  for (const rel of ["marketplaces", "cache"]) {
    const dir = join(pluginsRoot, rel);
    if (!isDirectory(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy, {
      directoriesOnly: true,
    })) {
      cards.push(
        makeCard({
          kind: "plugins",
          host: "claude",
          path: child,
          scope: "user",
          pathOnly: true,
          meta: { source: `claude.plugins.${rel}` },
        }),
      );
    }
  }

  return cards;
}

/** Task session dirs under ~/.claude/tasks (path-only). */
export function findClaudeTasks(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const root = join(claudeHome(), "tasks");
  if (!isDirectory(root)) {
    return cards;
  }
  for (const child of listChildPaths(root, ctx.policy, {
    directoriesOnly: true,
  })) {
    cards.push(
      makeCard({
        kind: "tasks",
        host: "claude",
        path: child,
        scope: "user",
        pathOnly: true,
        meta: {
          source: "claude.tasks",
          bytes: fileBytes(child),
        },
      }),
    );
  }
  return cards;
}

/**
 * MCP: project .mcp.json if present + signals in .claude settings (path card only).
 */
export function findClaudeMcp(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    for (const name of [".mcp.json", "mcp.json", ".claude/mcp.json"]) {
      const p = join(ctx.repoRoot, name);
      if (!pathExists(p)) {
        continue;
      }
      cards.push(
        makeCard({
          kind: "mcp",
          host: "claude",
          path: p,
          name,
          scope: "project",
          repoRoot: ctx.repoRoot,
          pathOnly: true,
          meta: { source: "project.mcp" },
        }),
      );
    }
  }
  if (wantUser(ctx)) {
    const settings = join(claudeHome(), "settings.json");
    if (pathExists(settings)) {
      cards.push(
        makeCard({
          kind: "mcp",
          host: "claude",
          path: settings,
          name: "claude-settings",
          scope: "user",
          pathOnly: true,
          meta: {
            source: "claude.settings",
            note: "MCP servers may be embedded; show is path-only",
          },
        }),
      );
    }
  }
  void projectClaude;
  return cards;
}

/** User-global CLAUDE.md when present. */
export function findClaudeUserInstructions(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const p = join(claudeHome(), "CLAUDE.md");
  if (!pathExists(p)) {
    return [];
  }
  return [
    {
      id: pathCardId("instructions", p),
      kind: "instructions",
      host: "claude",
      name: "CLAUDE.md",
      path: p,
      scope: "user",
      mtime_ms: mtimeMs(p),
      meta: { global: true, source: "claude.home" },
    },
  ];
}
