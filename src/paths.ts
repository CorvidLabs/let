/**
 * Path helpers — home roots, repo detection stubs for PR1a.
 * Full ScanPolicy and adapter roots land with find in PR1b.
 */

import { homedir } from "node:os";
import { join, resolve } from "node:path";

export function homeDir(): string {
  return homedir();
}

export function claudeHome(): string {
  return join(homeDir(), ".claude");
}

export function grokHome(): string {
  return join(homeDir(), ".grok");
}

export function codexHome(): string {
  return join(homeDir(), ".codex");
}

export function cursorHome(): string {
  return join(homeDir(), ".cursor");
}

/** Google Gemini CLI / Antigravity home. */
export function geminiHome(): string {
  return join(homeDir(), ".gemini");
}

/** Kimi Code CLI home. */
export function kimiHome(): string {
  return join(homeDir(), ".kimi-code");
}

export function projectClaudeDir(repoRoot: string): string {
  return join(repoRoot, ".claude");
}

export function projectGeminiDir(repoRoot: string): string {
  return join(repoRoot, ".gemini");
}

export function projectLetDir(repoRoot: string): string {
  return join(repoRoot, ".let");
}

/** Resolve cwd-relative path to absolute. */
export function absPath(path: string, cwd: string = process.cwd()): string {
  return resolve(cwd, path);
}

/**
 * Encode a filesystem path the way Claude projects directories do:
 * replace `/` and `_` with `-` (leading `/` becomes leading `-`).
 * Example: /Users/leif/Development/_CorvidLabs/quill
 * → -Users-leif-Development--CorvidLabs-quill
 */
export function encodeClaudeProjectPath(absolutePath: string): string {
  const normalized = absolutePath.replace(/\\/g, "/");
  const body = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  const encoded = body.replaceAll("/", "-").replaceAll("_", "-");
  return normalized.startsWith("/") ? `-${encoded}` : encoded;
}

export function claudeProjectDir(absoluteRepoPath: string): string {
  return join(
    claudeHome(),
    "projects",
    encodeClaudeProjectPath(absoluteRepoPath),
  );
}
