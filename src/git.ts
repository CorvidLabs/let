/**
 * Git helpers — porcelain worktree list, toplevel, common-dir.
 * Never throws for non-git dirs; returns null / empty.
 */

import { realpathSync } from "node:fs";
import { resolve } from "node:path";

export type GitWorktreeEntry = {
  path: string;
  head?: string;
  branch?: string;
  bare: boolean;
  detached: boolean;
  locked: boolean;
  prunable: boolean;
};

function runGit(args: string[], cwd: string): { ok: boolean; stdout: string } {
  try {
    const proc = Bun.spawnSync(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new TextDecoder().decode(proc.stdout).trim();
    return { ok: proc.exitCode === 0, stdout };
  } catch {
    return { ok: false, stdout: "" };
  }
}

export function safeRealpath(path: string): string | null {
  try {
    return realpathSync(resolve(path));
  } catch {
    try {
      return resolve(path);
    } catch {
      return null;
    }
  }
}

/** Git toplevel for cwd, or null if not in a repo. */
export function gitToplevel(cwd: string): string | null {
  const r = runGit(["rev-parse", "--show-toplevel"], cwd);
  if (!r.ok || !r.stdout) {
    return null;
  }
  return safeRealpath(r.stdout);
}

/** Realpath of git common dir for cwd. */
export function gitCommonDir(cwd: string): string | null {
  const r = runGit(["rev-parse", "--git-common-dir"], cwd);
  if (!r.ok || !r.stdout) {
    return null;
  }
  const raw = r.stdout;
  const abs = raw.startsWith("/") ? raw : resolve(cwd, raw);
  return safeRealpath(abs);
}

/** Current branch name, or null if detached / non-git. */
export function gitBranch(cwd: string): string | null {
  const r = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (!r.ok || !r.stdout || r.stdout === "HEAD") {
    return null;
  }
  return r.stdout;
}

/** HEAD sha short or full. */
export function gitHead(cwd: string): string | null {
  const r = runGit(["rev-parse", "HEAD"], cwd);
  if (!r.ok || !r.stdout) {
    return null;
  }
  return r.stdout;
}

/**
 * Parse `git worktree list --porcelain` for the repo containing cwd.
 * Paths are realpathed when possible.
 */
export function gitWorktreeList(cwd: string): GitWorktreeEntry[] {
  const r = runGit(["worktree", "list", "--porcelain"], cwd);
  if (!r.ok || !r.stdout) {
    return [];
  }

  const entries: GitWorktreeEntry[] = [];
  let current: Partial<GitWorktreeEntry> | null = null;

  const flush = () => {
    if (current?.path) {
      const rp = safeRealpath(current.path) ?? current.path;
      entries.push({
        path: rp,
        head: current.head,
        branch: current.branch,
        bare: current.bare ?? false,
        detached: current.detached ?? false,
        locked: current.locked ?? false,
        prunable: current.prunable ?? false,
      });
    }
    current = null;
  };

  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      current = {
        path: line.slice("worktree ".length),
        bare: false,
        detached: false,
        locked: false,
        prunable: false,
      };
      continue;
    }
    if (!current) {
      continue;
    }
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      // refs/heads/name
      const ref = line.slice("branch ".length);
      current.branch = ref.replace(/^refs\/heads\//, "");
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line.startsWith("locked")) {
      current.locked = true;
    } else if (line.startsWith("prunable")) {
      current.prunable = true;
    }
  }
  flush();
  return entries;
}

export function mapGitStatus(
  entry: GitWorktreeEntry,
): "active" | "prunable" | "locked" | "unknown" {
  if (entry.prunable) {
    return "prunable";
  }
  if (entry.locked) {
    return "locked";
  }
  return "active";
}
