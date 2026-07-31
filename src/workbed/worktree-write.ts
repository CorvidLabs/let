/**
 * let-managed worktree writes under .let/worktrees/
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../config.ts";
import { LetError } from "../errors.ts";
import { pathExists } from "../fs-scan.ts";
import { gitBranch, gitToplevel } from "../git.ts";
import { projectLetDir } from "../paths.ts";

export type WorktreeAddResult = {
  path: string;
  branch: string;
  created: boolean;
  command: string;
};

function runGit(args: string[], cwd: string): { ok: boolean; out: string } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out =
    new TextDecoder().decode(proc.stdout) +
    new TextDecoder().decode(proc.stderr);
  return { ok: proc.exitCode === 0, out: out.trim() };
}

export function worktreeAdd(opts: {
  repoRoot: string;
  name: string;
  branch?: string;
  base_dir?: string;
}): WorktreeAddResult {
  const name = opts.name
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/^\/+|\/+$/g, "");
  if (!name) {
    throw new LetError("validation", "worktree name required");
  }
  const top = gitToplevel(opts.repoRoot) ?? opts.repoRoot;
  const baseRel =
    opts.base_dir ?? DEFAULT_CONFIG.worktree.base_dir ?? ".let/worktrees";
  const parent = join(top, baseRel);
  mkdirSync(parent, { recursive: true });
  const path = join(parent, name);
  if (pathExists(path)) {
    throw new LetError("conflict", `Worktree path already exists: ${path}`, {
      path,
    });
  }

  const branch = opts.branch ?? `let/${name}`;
  // Prefer new branch from HEAD
  const cmdArgs = ["worktree", "add", "-b", branch, path];
  const r = runGit(cmdArgs, top);
  if (!r.ok) {
    // branch may exist — try without -b
    const r2 = runGit(["worktree", "add", path, branch], top);
    if (!r2.ok) {
      throw new LetError(
        "dependency",
        `git worktree add failed: ${r.out || r2.out}`,
        { stderr: r.out || r2.out },
      );
    }
    return {
      path,
      branch: gitBranch(path) ?? branch,
      created: true,
      command: `git worktree add ${path} ${branch}`,
    };
  }
  return {
    path,
    branch,
    created: true,
    command: `git worktree add -b ${branch} ${path}`,
  };
}

export function worktreeRemove(opts: {
  repoRoot: string;
  path: string;
  force?: boolean;
}): { path: string; removed: boolean } {
  const top = gitToplevel(opts.repoRoot) ?? opts.repoRoot;
  const args = opts.force
    ? ["worktree", "remove", "--force", opts.path]
    : ["worktree", "remove", opts.path];
  const r = runGit(args, top);
  if (!r.ok) {
    throw new LetError("dependency", `git worktree remove failed: ${r.out}`, {
      path: opts.path,
    });
  }
  return { path: opts.path, removed: true };
}

export function ensureLetWorktreeParent(repoRoot: string): string {
  const parent = join(projectLetDir(repoRoot), "worktrees");
  mkdirSync(parent, { recursive: true });
  return parent;
}
