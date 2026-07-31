/**
 * Build ScanContext from cwd / options.
 */

import { resolve } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { type LetConfig, loadConfig, DEFAULT_LIMIT, MAX_LIMIT } from "../config.ts";
import { gitCommonDir, gitToplevel, safeRealpath } from "../git.ts";
import { homeDir } from "../paths.ts";
import { DEFAULT_SCAN_POLICY, type ScanPolicy } from "./scan-policy.ts";
import type { FindScope } from "./types.ts";

export type BuildContextOptions = {
  cwd?: string;
  repo?: string;
  scope?: FindScope;
  limit?: number;
  config?: LetConfig;
  policy?: ScanPolicy;
};

export function buildScanContext(opts: BuildContextOptions = {}): ScanContext {
  const cwd = safeRealpath(opts.cwd ?? process.cwd()) ?? resolve(opts.cwd ?? process.cwd());
  const loaded = opts.config ? null : loadConfig(cwd);
  const config = opts.config ?? loaded!.config;

  // Prefer explicit --repo; else git toplevel (works from worktree → main via common-dir logic:
  // show-toplevel returns the worktree root, but we want parent repo root for attribution.
  // Design: use common-dir's parent when inside a linked worktree.
  let repoRoot: string | null = null;
  let repoCommonDir: string | null = null;

  if (opts.repo) {
    repoRoot = safeRealpath(opts.repo) ?? resolve(opts.repo);
    repoCommonDir = gitCommonDir(repoRoot);
  } else {
    const toplevel = gitToplevel(cwd);
    repoCommonDir = gitCommonDir(cwd);
    if (toplevel && repoCommonDir) {
      // Main worktree: common dir is <repo>/.git → repo is toplevel
      // Linked worktree: common dir is <main>/.git → parent of .git is main repo
      if (repoCommonDir.endsWith("/.git") || repoCommonDir.endsWith(".git")) {
        const mainGuess = repoCommonDir.replace(/\/?\.git$/, "");
        const mainRp = safeRealpath(mainGuess);
        // If cwd's toplevel differs from main, we're in a linked worktree
        if (mainRp && toplevel !== mainRp) {
          repoRoot = mainRp;
        } else {
          repoRoot = toplevel;
        }
      } else {
        // common dir might be .git file pointing elsewhere — toplevel is fine for main
        repoRoot = toplevel;
        // When linked, git rev-parse --git-common-dir is absolute path to main .git
        const mainFromCommon = safeRealpath(
          repoCommonDir.replace(/\/?\.git$/, ""),
        );
        if (mainFromCommon && toplevel !== mainFromCommon) {
          repoRoot = mainFromCommon;
        }
      }
      repoCommonDir = gitCommonDir(repoRoot) ?? repoCommonDir;
    } else {
      repoRoot = toplevel;
    }
  }

  let limit = opts.limit ?? config.find.default_limit ?? DEFAULT_LIMIT;
  limit = Math.min(Math.max(1, limit), MAX_LIMIT);

  return {
    cwd,
    repoRoot,
    repoCommonDir,
    home: homeDir(),
    config,
    scope: opts.scope ?? "project",
    policy: opts.policy ?? DEFAULT_SCAN_POLICY,
    limit,
  };
}
