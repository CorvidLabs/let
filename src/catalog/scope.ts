/**
 * Scope helpers shared by host adapters.
 */

import type { ScanContext } from "../adapters/types.ts";

/** Project-attributable roots (repo + cwd under repo). */
export function wantProject(ctx: ScanContext): boolean {
  return ctx.scope === "project" || ctx.scope === "all";
}

/**
 * User/global roots. Project scope still includes user catalogs when
 * `include_user_skills` is true (default) so agents see personal skills/plugins.
 */
export function wantUser(ctx: ScanContext): boolean {
  return (
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    (ctx.scope === "project" && ctx.config.find.include_user_skills)
  );
}

export function underRepo(path: string, ctx: ScanContext): boolean {
  return Boolean(ctx.repoRoot && path.startsWith(ctx.repoRoot));
}
