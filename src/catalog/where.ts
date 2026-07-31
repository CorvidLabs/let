/**
 * `let where [path]` — classify cwd and list related assets.
 */

import type { ScanContext } from "../adapters/types.ts";
import { pathExists } from "../fs-scan.ts";
import { gitBranch, safeRealpath } from "../git.ts";
import { worktreeId } from "./ids.ts";
import { findInstructions } from "./instructions.ts";
import { attributeHost, federateWorktrees } from "./merge.ts";
import type { HostId, IndexCard, WorktreeCard } from "./types.ts";

export type WhereResult = {
  path: string;
  kind: string;
  host: HostId;
  repo_root: string | null;
  branch?: string;
  status?: string;
  id?: string;
  related: {
    sibling_worktrees: WorktreeCard[];
    instructions: IndexCard[];
    /** v0: always empty (no session correlation). */
    sessions: [];
  };
};

export function whereAmI(ctx: ScanContext, targetPath?: string): WhereResult {
  const path = safeRealpath(targetPath ?? ctx.cwd) ?? targetPath ?? ctx.cwd;

  const host = attributeHost(path, ctx);
  const branch = pathExists(path) ? (gitBranch(path) ?? undefined) : undefined;

  // Are we standing inside a known worktree?
  const { cards } = federateWorktrees(ctx);
  const self = cards.find((c) => c.path === path);
  const siblings = cards.filter((c) => c.path !== path);

  const instructions = findInstructions(ctx);

  return {
    path,
    kind: self ? "worktrees" : pathExists(path) ? "directory" : "missing",
    host: self?.host ?? host,
    repo_root: ctx.repoRoot,
    branch: self?.branch ?? branch,
    status: self?.status,
    id: self?.id ?? (self ? undefined : worktreeId(path)),
    related: {
      sibling_worktrees: siblings.slice(0, ctx.limit),
      instructions,
      sessions: [],
    },
  };
}
