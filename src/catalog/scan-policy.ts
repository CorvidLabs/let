/**
 * ScanPolicy — fixed roots, shallow depths, no free-form root injection.
 */

import { join } from "node:path";
import type { LetConfig } from "../config.ts";
import {
  claudeHome,
  codexHome,
  cursorHome,
  grokHome,
  homeDir,
} from "../paths.ts";

export type ScanPolicy = {
  followSymlinks: "never" | "within-root";
  maxEntriesPerRoot: number;
  maxDurationMs: number;
  denyFileBasenames: string[];
};

export const DEFAULT_SCAN_POLICY: ScanPolicy = {
  followSymlinks: "within-root",
  maxEntriesPerRoot: 500,
  maxDurationMs: 15_000,
  denyFileBasenames: [
    "auth.json",
    "history.jsonl",
    "managed_config.toml",
    ".env",
    "oauth_creds.json",
    "google_accounts.json",
    "credentials",
  ],
};

export type WorktreeBase = {
  host: "claude" | "project" | "let" | "corvid";
  /** Absolute path to the worktree parent dir. */
  path: string;
  maxDepth: number;
};

/** In-repo worktree parent directories (depth-1 children are candidates). */
export function inRepoWorktreeBases(
  repoRoot: string,
  config: LetConfig,
): WorktreeBase[] {
  return [
    {
      host: "claude",
      path: join(repoRoot, ".claude", "worktrees"),
      maxDepth: 1,
    },
    { host: "project", path: join(repoRoot, ".worktrees"), maxDepth: 1 },
    {
      host: "let",
      path: join(repoRoot, config.worktree.base_dir),
      maxDepth: 1,
    },
    { host: "corvid", path: join(repoRoot, ".corvid-worktrees"), maxDepth: 1 },
  ];
}

export function externalWorktreeRoots(home: string = ""): {
  codex: string;
  cursor: string;
} {
  // home unused if helpers use os.homedir — keep for testability later
  void home;
  return {
    codex: join(codexHome(), "worktrees"),
    cursor: join(cursorHome(), "worktrees"),
  };
}

export function skillRoots(repoRoot: string | null): {
  project: string[];
  user: string[];
} {
  const project: string[] = [];
  if (repoRoot) {
    project.push(
      join(repoRoot, ".claude", "skills"),
      join(repoRoot, ".grok", "skills"),
      join(repoRoot, ".cursor", "skills"),
      join(repoRoot, ".cursor", "skills-cursor"),
      join(repoRoot, ".let", "skills"),
      join(repoRoot, "skills"),
      join(repoRoot, ".agents", "skills"),
    );
  }
  const user = [
    join(claudeHome(), "skills"),
    join(grokHome(), "bundled", "skills"),
    join(grokHome(), "skills"),
    join(cursorHome(), "skills-cursor"),
    join(cursorHome(), "skills"),
    join(codexHome(), "skills"),
    join(homeDir(), ".let", "skills"),
  ];
  return { project, user };
}

export function isDeniedBasename(name: string, policy: ScanPolicy): boolean {
  const lower = name.toLowerCase();
  return policy.denyFileBasenames.some(
    (d) =>
      d.toLowerCase() === lower ||
      (d.startsWith("*.") && lower.endsWith(d.slice(1))),
  );
}
