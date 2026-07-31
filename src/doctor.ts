/**
 * `let doctor` — environment health for adapters and roots (PR1a skeleton).
 */

import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import {
  claudeHome,
  codexHome,
  cursorHome,
  geminiHome,
  grokHome,
  kimiHome,
  projectClaudeDir,
} from "./paths.ts";

export type DoctorCheck = {
  id: string;
  ok: boolean;
  detail: string;
  path?: string;
};

export type DoctorReport = {
  version: string;
  cwd: string;
  checks: DoctorCheck[];
  roots: Record<string, { path: string; exists: boolean; note?: string }>;
  config: {
    userPath: string;
    projectPath: string | null;
    allow_shell_exec: boolean;
    default_limit: number;
  };
};

function rootEntry(
  path: string,
  note?: string,
): { path: string; exists: boolean; note?: string } {
  return { path, exists: existsSync(path), note };
}

function whichGit(): string | null {
  try {
    const proc = Bun.spawnSync(["git", "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode === 0) {
      return new TextDecoder().decode(proc.stdout).trim();
    }
  } catch {
    // ignore
  }
  return null;
}

export function runDoctor(cwd: string = process.cwd()): DoctorReport {
  const loaded = loadConfig(cwd);
  const checks: DoctorCheck[] = [];

  const gitVersion = whichGit();
  checks.push({
    id: "git",
    ok: gitVersion !== null,
    detail:
      gitVersion ?? "git not found on PATH (required for worktree federation)",
  });

  const bunVersion = Bun.version;
  checks.push({
    id: "bun",
    ok: true,
    detail: `bun ${bunVersion}`,
  });

  const roots = {
    "claude.home": rootEntry(claudeHome()),
    "claude.skills": rootEntry(join(claudeHome(), "skills")),
    "claude.projects": rootEntry(join(claudeHome(), "projects")),
    "grok.home": rootEntry(grokHome()),
    "grok.skills": rootEntry(join(grokHome(), "bundled", "skills")),
    "grok.worktrees_db": rootEntry(join(grokHome(), "worktrees.db")),
    "codex.worktrees": rootEntry(
      join(codexHome(), "worktrees"),
      "shallow scan only",
    ),
    "cursor.worktrees": rootEntry(join(cursorHome(), "worktrees")),
    "gemini.home": rootEntry(
      geminiHome(),
      "GEMINI.md + history + projects.json",
    ),
    "gemini.history": rootEntry(
      join(geminiHome(), "history"),
      "path-only sessions",
    ),
    "kimi.home": rootEntry(kimiHome(), "Kimi Code CLI"),
    "kimi.sessions": rootEntry(
      join(kimiHome(), "sessions"),
      "path-only; matched via workspaces.json",
    ),
    "kimi.workspaces": rootEntry(join(kimiHome(), "workspaces.json")),
    "project.claude": rootEntry(projectClaudeDir(cwd)),
    "project.claude.worktrees": rootEntry(
      join(projectClaudeDir(cwd), "worktrees"),
      "host-owned worktrees — federated by find",
    ),
    "project.let": rootEntry(
      join(cwd, ".let"),
      "optional; not required for find",
    ),
  };

  for (const [id, root] of Object.entries(roots)) {
    if (id.endsWith(".home") || id.startsWith("project.")) {
      checks.push({
        id: `root.${id}`,
        ok: true,
        detail: root.exists ? "present" : "absent",
        path: root.path,
      });
    }
  }

  // Flag huge Codex root if present (doctor only — no walk)
  const codexWt = join(codexHome(), "worktrees");
  if (existsSync(codexWt)) {
    try {
      const st = statSync(codexWt);
      checks.push({
        id: "codex.worktrees.dir",
        ok: st.isDirectory(),
        detail: st.isDirectory()
          ? "directory present (ScanPolicy will shallow-list only)"
          : "not a directory",
        path: codexWt,
      });
    } catch (err) {
      checks.push({
        id: "codex.worktrees.dir",
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        path: codexWt,
      });
    }
  }

  checks.push({
    id: "config.trust",
    ok: !loaded.config.allow_shell_exec,
    detail: loaded.config.allow_shell_exec
      ? "allow_shell_exec is ON (user/env only)"
      : "allow_shell_exec is OFF (default)",
  });

  checks.push({
    id: "find.ready",
    ok: true,
    detail:
      "find/where/context available (federated worktrees, skills, instructions)",
  });

  return {
    version: "0.1.0",
    cwd,
    checks,
    roots,
    config: {
      userPath: loaded.userPath,
      projectPath: loaded.projectPath,
      allow_shell_exec: loaded.config.allow_shell_exec,
      default_limit: loaded.config.find.default_limit,
    },
  };
}
