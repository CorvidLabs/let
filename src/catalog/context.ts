/**
 * `let context` — unified pack for agents (no session paths).
 */

import type { ScanContext } from "../adapters/types.ts";
import { findAssets } from "./find.ts";
import { findInstructions } from "./instructions.ts";
import { federateWorktrees } from "./merge.ts";
import { findSkills } from "./skills.ts";
import type { IndexCard, WorktreeCard } from "./types.ts";

export type ContextPack = "brief" | "full";

export type ContextResult = {
  pack: ContextPack;
  cwd: string;
  repo_root: string | null;
  instructions: IndexCard[];
  worktrees: {
    count: number;
    sample: WorktreeCard[];
  };
  skills: {
    count: number;
    sample: IndexCard[];
  };
  /** Explicitly never sessions (design Q3). */
  sessions: never[];
};

export async function buildContext(
  ctx: ScanContext,
  pack: ContextPack = "brief",
): Promise<ContextResult> {
  const instructions = findInstructions(ctx);
  const wt = federateWorktrees(ctx);
  const skills = findSkills(ctx);

  const sampleN = pack === "brief" ? 5 : 25;

  // full pack still excludes sessions
  if (pack === "full") {
    await findAssets("commands", ctx); // warm/partial — ignore for pack shape
  }

  return {
    pack,
    cwd: ctx.cwd,
    repo_root: ctx.repoRoot,
    instructions,
    worktrees: {
      count: wt.total,
      sample: wt.cards.slice(0, sampleN),
    },
    skills: {
      count: skills.total,
      sample: skills.cards.slice(0, sampleN),
    },
    sessions: [],
  };
}
