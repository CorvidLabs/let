/**
 * let-native workbed assets under .let/ and ~/.let/
 * Federation still indexes host paths; these are let-standard write targets.
 */

import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import {
  isDirectory,
  listChildPaths,
  mtimeMs,
  pathExists,
} from "../fs-scan.ts";
import { homeDir, projectLetDir } from "../paths.ts";
import { makeCard } from "./card-factory.ts";
import { wantProject, wantUser } from "./scope.ts";
import type { IndexCard } from "./types.ts";

export function letUserHome(): string {
  return join(homeDir(), ".let");
}

export function findLetMemory(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(projectLetDir(ctx.repoRoot), "memory"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(letUserHome(), "memory"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    cards.push(
      makeCard({
        kind: "memory",
        host: "let",
        path: dir,
        name: "memory",
        scope,
        repoRoot: scope === "project" ? ctx.repoRoot : null,
        pathOnly: true,
        meta: { source: "let.memory", standard: "let" },
      }),
    );
    if (isDirectory(dir)) {
      for (const child of listChildPaths(dir, ctx.policy)) {
        cards.push(
          makeCard({
            kind: "memory",
            host: "let",
            path: child,
            scope,
            repoRoot: scope === "project" ? ctx.repoRoot : null,
            pathOnly: true,
            meta: { source: "let.memory.entry", standard: "let" },
          }),
        );
      }
    }
  }
  return cards;
}

export function findLetSuperskills(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(projectLetDir(ctx.repoRoot), "superskills"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(letUserHome(), "superskills"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      if (
        !child.endsWith(".toml") &&
        !child.endsWith(".md") &&
        !child.endsWith(".3md") &&
        !isDirectory(child)
      ) {
        continue;
      }
      cards.push(
        makeCard({
          kind: "superskills",
          host: "let",
          path: child,
          name: basename(child).replace(/\.(toml|md|3md)$/, ""),
          scope,
          repoRoot: scope === "project" ? ctx.repoRoot : null,
          meta: { source: "let.superskills", standard: "let" },
        }),
      );
    }
  }
  return cards;
}

export function findLetWorkflows(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(projectLetDir(ctx.repoRoot), "workflows"),
      scope: "project",
    });
    roots.push({
      dir: join(ctx.repoRoot, ".grok", "workflows"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(letUserHome(), "workflows"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      cards.push(
        makeCard({
          kind: "workflows",
          host: "let",
          path: child,
          name: basename(child),
          scope,
          repoRoot: scope === "project" ? ctx.repoRoot : null,
          meta: { source: "let.workflows", standard: "let" },
        }),
      );
    }
  }
  return cards;
}

export function findLetAgents(ctx: ScanContext): IndexCard[] {
  // agent.3md discovery owns .3md files; this only indexes non-3md under .let/agents
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(projectLetDir(ctx.repoRoot), "agents"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(letUserHome(), "agents"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!pathExists(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      if (child.endsWith(".3md")) {
        continue; // agent3md adapter
      }
      cards.push(
        makeCard({
          kind: "agents",
          host: "let",
          path: child,
          scope,
          repoRoot: scope === "project" ? ctx.repoRoot : null,
          meta: { source: "let.agents", standard: "let" },
        }),
      );
    }
  }
  void mtimeMs;
  return cards;
}

export function findLetSessions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots: { dir: string; scope: "project" | "user" }[] = [];
  if (wantProject(ctx) && ctx.repoRoot) {
    roots.push({
      dir: join(projectLetDir(ctx.repoRoot), "sessions"),
      scope: "project",
    });
  }
  if (wantUser(ctx)) {
    roots.push({ dir: join(letUserHome(), "sessions"), scope: "user" });
  }
  for (const { dir, scope } of roots) {
    if (!isDirectory(dir)) {
      continue;
    }
    for (const child of listChildPaths(dir, ctx.policy)) {
      cards.push(
        makeCard({
          kind: "sessions",
          host: "let",
          path: child,
          scope,
          repoRoot: scope === "project" ? ctx.repoRoot : null,
          pathOnly: true,
          meta: { source: "let.sessions", standard: "let" },
        }),
      );
    }
  }
  return cards;
}
