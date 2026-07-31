/**
 * Cursor host adapter — ~/.cursor + project .cursor
 */

import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import {
  isDirectory,
  listChildPaths,
  mtimeMs,
  parseSkillFrontmatter,
  pathExists,
  readTextFile,
} from "../fs-scan.ts";
import { cursorHome } from "../paths.ts";
import { makeCard } from "./card-factory.ts";
import { skillId } from "./ids.ts";
import { wantProject, wantUser, wantUserGlobal } from "./scope.ts";
import type { IndexCard } from "./types.ts";

export function findCursorAgents(ctx: ScanContext): IndexCard[] {
  if (!wantUser(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const dir = join(cursorHome(), "agents");
  if (!pathExists(dir)) {
    return cards;
  }
  for (const child of listChildPaths(dir, ctx.policy)) {
    cards.push(
      makeCard({
        kind: "agents",
        host: "cursor",
        path: child,
        scope: "user",
        meta: { source: "cursor.agents" },
      }),
    );
  }
  return cards;
}

/** Project + user slash-style commands under .cursor/commands. */
export function findCursorCommands(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(ctx.repoRoot, ".cursor", "commands"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(cursorHome(), "commands"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      cards.push(
        makeCard({
          kind: "commands",
          host: "cursor",
          path: child,
          scope,
          repoRoot: scope === "project" ? ctx.repoRoot : null,
          meta: { source: "cursor.commands" },
        }),
      );
    }
  }
  return cards;
}

/** Chats under ~/.cursor/chats — path-only sessions (user|all only). */
export function findCursorSessions(ctx: ScanContext): IndexCard[] {
  if (!wantUserGlobal(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const chats = join(cursorHome(), "chats");
  if (!isDirectory(chats)) {
    return cards;
  }
  for (const child of listChildPaths(chats, ctx.policy, {
    directoriesOnly: true,
  })) {
    cards.push(
      makeCard({
        kind: "sessions",
        host: "cursor",
        path: child,
        scope: "user",
        pathOnly: true,
        meta: { source: "cursor.chats" },
      }),
    );
  }
  // project indexes — dir names often encode paths like Users-leif-Development-…
  const projects = join(cursorHome(), "projects");
  if (isDirectory(projects) && (ctx.scope === "user" || ctx.scope === "all")) {
    for (const child of listChildPaths(projects, ctx.policy, {
      directoriesOnly: true,
    }).slice(0, 100)) {
      const leaf = basename(child);
      const repoRoot = decodeCursorProjectName(leaf);
      cards.push(
        makeCard({
          kind: "sessions",
          host: "cursor",
          path: child,
          name: leaf,
          scope: "user",
          pathOnly: true,
          repoRoot: repoRoot ?? null,
          meta: {
            source: "cursor.projects",
            kind: "project_index",
            decoded_root: repoRoot,
          },
        }),
      );
    }
  }
  return cards;
}

/** Best-effort: Users-leif-Development-foo → /Users/leif/Development/foo */
function decodeCursorProjectName(name: string): string | undefined {
  if (name.startsWith("Users-") || name.startsWith("home-")) {
    const body = name.replaceAll("-", "/");
    const abs = `/${body}`;
    if (abs.startsWith("/Users/") || abs.startsWith("/home/")) {
      return abs;
    }
  }
  return undefined;
}

/** Plans as tasks (user|all; body allowed on show — markdown plans). */
export function findCursorTasks(ctx: ScanContext): IndexCard[] {
  if (!wantUserGlobal(ctx)) {
    return [];
  }
  const cards: IndexCard[] = [];
  const plans = join(cursorHome(), "plans");
  if (!pathExists(plans)) {
    return cards;
  }
  for (const child of listChildPaths(plans, ctx.policy)) {
    cards.push(
      makeCard({
        kind: "tasks",
        host: "cursor",
        path: child,
        name: basename(child).replace(/\.plan\.md$/, ""),
        scope: "user",
        // plans are markdown playbooks — allow show body
        meta: { source: "cursor.plans", kind: "plan" },
      }),
    );
  }
  return cards;
}

/** Extra project skills under .cursor/skills (beyond skills-cursor). */
export function findCursorExtraSkills(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(ctx.repoRoot, ".cursor", "skills"),
      scope: "project",
    });
    roots.push({
      dir: join(ctx.repoRoot, ".cursor", "skills-cursor"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(cursorHome(), "skills"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
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
        id: skillId("cursor", name, bodyPath),
        kind: "skills",
        host: "cursor",
        name,
        path: bodyPath,
        scope,
        description: fm.description,
        repo_root:
          scope === "project" ? (ctx.repoRoot ?? undefined) : undefined,
        mtime_ms: mtimeMs(bodyPath),
        meta: { source: "cursor.skills" },
      });
    }
  }
  return cards;
}

export function findCursorMcp(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    for (const rel of [".cursor/mcp.json", "mcp.json"]) {
      const p = join(ctx.repoRoot, rel);
      if (!pathExists(p)) {
        continue;
      }
      cards.push(
        makeCard({
          kind: "mcp",
          host: "cursor",
          path: p,
          name: rel,
          scope: "project",
          repoRoot: ctx.repoRoot,
          pathOnly: true,
          meta: { source: "cursor.mcp" },
        }),
      );
    }
  }
  if (wantUser(ctx)) {
    const p = join(cursorHome(), "mcp.json");
    if (pathExists(p)) {
      cards.push(
        makeCard({
          kind: "mcp",
          host: "cursor",
          path: p,
          scope: "user",
          pathOnly: true,
          meta: { source: "cursor.mcp" },
        }),
      );
    }
  }
  return cards;
}
