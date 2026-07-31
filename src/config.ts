/**
 * Config merge with trust layers.
 * Security-sensitive keys only come from user config / env — never project.
 * See docs/design.md § Config trust layers.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homeDir } from "./paths.ts";

export type LetConfig = {
  find: {
    /** Default card limit (DEFAULT_LIMIT). */
    default_limit: number;
    /** Hard cap (MAX_LIMIT). */
    max_limit: number;
    /** Include user/bundled skills when scope=project. User-config only opt-out. */
    include_user_skills: boolean;
  };
  scan: {
    /** Follow symlinks outside adapter roots — always false for security; reserved. */
    follow_symlinks_outside_root: boolean;
  };
  worktree: {
    /** Default write base under repo (relative). */
    base_dir: string;
  };
  /** When true, shell tool-run is allowed (off by default; future). */
  allow_shell_exec: boolean;
};

export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 500;

export const DEFAULT_CONFIG: LetConfig = {
  find: {
    default_limit: DEFAULT_LIMIT,
    max_limit: MAX_LIMIT,
    include_user_skills: true,
  },
  scan: {
    follow_symlinks_outside_root: false,
  },
  worktree: {
    base_dir: ".let/worktrees",
  },
  allow_shell_exec: false,
};

/** Keys that project config MUST NOT override. */
const PROJECT_FORBIDDEN_KEYS = new Set([
  "allow_shell_exec",
  "scan.follow_symlinks_outside_root",
  "find.include_user_skills",
]);

export type ConfigSource = "default" | "user" | "env" | "project";

export type LoadedConfig = {
  config: LetConfig;
  sources: Partial<Record<string, ConfigSource>>;
  userPath: string;
  projectPath: string | null;
};

function deepMerge(
  base: LetConfig,
  overlay: Partial<LetConfig>,
): LetConfig {
  return {
    find: { ...base.find, ...overlay.find },
    scan: { ...base.scan, ...overlay.scan },
    worktree: { ...base.worktree, ...overlay.worktree },
    allow_shell_exec:
      overlay.allow_shell_exec !== undefined
        ? overlay.allow_shell_exec
        : base.allow_shell_exec,
  };
}

function readTomlLite(path: string): Record<string, unknown> {
  // Minimal TOML-ish reader for flat/section keys we care about in v0.
  // Full TOML parser can land later; PR1a only needs simple key=value sections.
  if (!existsSync(path)) {
    return {};
  }
  const text = readFileSync(path, "utf8");
  const out: Record<string, unknown> = {};
  let section = "";
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch?.[1]) {
      section = sectionMatch[1].trim();
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.]+)\s*=\s*(.+)$/);
    if (!kv?.[1] || kv[2] === undefined) {
      continue;
    }
    const key = section ? `${section}.${kv[1]}` : kv[1];
    let raw = kv[2].trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      raw = raw.slice(1, -1);
    }
    let value: unknown = raw;
    if (raw === "true") {
      value = true;
    } else if (raw === "false") {
      value = false;
    } else if (/^-?\d+$/.test(raw)) {
      value = Number(raw);
    }
    out[key] = value;
  }
  return out;
}

function flatToConfig(flat: Record<string, unknown>): Partial<LetConfig> {
  const partial: Partial<LetConfig> = {};
  const find: Partial<LetConfig["find"]> = {};
  const scan: Partial<LetConfig["scan"]> = {};
  const worktree: Partial<LetConfig["worktree"]> = {};

  if (typeof flat["find.default_limit"] === "number") {
    find.default_limit = flat["find.default_limit"];
  }
  if (typeof flat["find.max_limit"] === "number") {
    find.max_limit = flat["find.max_limit"];
  }
  if (typeof flat["find.include_user_skills"] === "boolean") {
    find.include_user_skills = flat["find.include_user_skills"];
  }
  if (typeof flat["scan.follow_symlinks_outside_root"] === "boolean") {
    scan.follow_symlinks_outside_root =
      flat["scan.follow_symlinks_outside_root"];
  }
  if (typeof flat["worktree.base_dir"] === "string") {
    worktree.base_dir = flat["worktree.base_dir"];
  }
  if (typeof flat.allow_shell_exec === "boolean") {
    partial.allow_shell_exec = flat.allow_shell_exec;
  }

  if (Object.keys(find).length > 0) {
    partial.find = find as LetConfig["find"];
  }
  if (Object.keys(scan).length > 0) {
    partial.scan = scan as LetConfig["scan"];
  }
  if (Object.keys(worktree).length > 0) {
    partial.worktree = worktree as LetConfig["worktree"];
  }
  return partial;
}

/** Strip project-forbidden keys before merge. */
function sanitizeProjectFlat(
  flat: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    if (PROJECT_FORBIDDEN_KEYS.has(key)) {
      continue;
    }
    // Also block top-level security aliases
    if (key === "allow_shell_exec") {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function applyEnv(config: LetConfig): LetConfig {
  const next = { ...config, find: { ...config.find } };
  const limit = process.env.LET_FIND_LIMIT;
  if (limit && /^\d+$/.test(limit)) {
    next.find.default_limit = Math.min(Number(limit), MAX_LIMIT);
  }
  if (process.env.LET_ALLOW_SHELL_EXEC === "1") {
    next.allow_shell_exec = true;
  }
  if (process.env.LET_INCLUDE_USER_SKILLS === "0") {
    next.find.include_user_skills = false;
  }
  return next;
}

export function userConfigPath(): string {
  return join(homeDir(), ".config", "let", "config.toml");
}

export function projectConfigPath(cwd: string = process.cwd()): string {
  return join(cwd, ".let", "config.toml");
}

/**
 * Load config: defaults ← user (~/.config/let/config.toml) ← env ← project (.let/config.toml sanitized).
 */
export function loadConfig(cwd: string = process.cwd()): LoadedConfig {
  const sources: LoadedConfig["sources"] = {};
  let config = { ...DEFAULT_CONFIG, find: { ...DEFAULT_CONFIG.find } };
  const userPath = userConfigPath();
  const projectPathCandidate = projectConfigPath(cwd);

  const userFlat = readTomlLite(userPath);
  if (Object.keys(userFlat).length > 0) {
    config = deepMerge(config, flatToConfig(userFlat));
    for (const key of Object.keys(userFlat)) {
      sources[key] = "user";
    }
  }

  config = applyEnv(config);
  if (process.env.LET_FIND_LIMIT) {
    sources["find.default_limit"] = "env";
  }
  if (process.env.LET_ALLOW_SHELL_EXEC === "1") {
    sources.allow_shell_exec = "env";
  }

  let projectPath: string | null = null;
  if (existsSync(projectPathCandidate)) {
    projectPath = projectPathCandidate;
    const projectFlat = sanitizeProjectFlat(readTomlLite(projectPathCandidate));
    if (Object.keys(projectFlat).length > 0) {
      config = deepMerge(config, flatToConfig(projectFlat));
      for (const key of Object.keys(projectFlat)) {
        sources[key] = "project";
      }
    }
  }

  // Clamp limits
  config.find.default_limit = Math.min(
    Math.max(1, config.find.default_limit),
    MAX_LIMIT,
  );
  config.find.max_limit = Math.min(
    Math.max(config.find.default_limit, config.find.max_limit),
    MAX_LIMIT,
  );

  return { config, sources, userPath, projectPath };
}
