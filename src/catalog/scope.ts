/**
 * Scope helpers shared by host adapters.
 */

import { sep } from "node:path";
import type { ScanContext } from "../adapters/types.ts";

/** Project-attributable roots (repo + cwd under repo). */
export function wantProject(ctx: ScanContext): boolean {
  return ctx.scope === "project" || ctx.scope === "all";
}

/**
 * User skill/agent catalogs. Project scope still includes them when
 * `include_user_skills` is true (default) so agents see personal skills.
 * Do NOT use for sessions/memory/tasks — use wantUserGlobal instead.
 */
export function wantUser(ctx: ScanContext): boolean {
  return (
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    (ctx.scope === "project" && ctx.config.find.include_user_skills)
  );
}

/**
 * Explicit user|all only. Global sessions, memory stores, and task dirs must
 * not flood default project find (design: project sessions are repo-bound).
 */
export function wantUserGlobal(ctx: ScanContext): boolean {
  return ctx.scope === "user" || ctx.scope === "all";
}

/** Path is under repo root with directory boundary (not prefix-sibling). */
export function underRepo(path: string, ctx: ScanContext): boolean {
  if (!ctx.repoRoot) {
    return false;
  }
  if (path === ctx.repoRoot) {
    return true;
  }
  const root = ctx.repoRoot.endsWith(sep) ? ctx.repoRoot : ctx.repoRoot + sep;
  return path.startsWith(root);
}
