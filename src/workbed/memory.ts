/**
 * Local let memory under .let/memory (and ~/.let/memory for user scope).
 * Simple key → JSON value store. Not a dump of host memtrace.
 */

import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { LetError } from "../errors.ts";
import { isDirectory, pathExists } from "../fs-scan.ts";
import { homeDir, projectLetDir } from "../paths.ts";

export type MemoryEntry = {
  key: string;
  path: string;
  scope: "project" | "user";
  bytes?: number;
  mtime_ms?: number;
  value?: unknown;
};

function memoryDir(scope: "project" | "user", repoRoot: string | null): string {
  if (scope === "user") {
    return join(homeDir(), ".let", "memory");
  }
  if (!repoRoot) {
    throw new LetError(
      "validation",
      "project memory requires a git repo (or pass --cwd inside one)",
    );
  }
  return join(projectLetDir(repoRoot), "memory");
}

function keyToFile(key: string): string {
  const safe = key
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  if (!safe) {
    throw new LetError("validation", `Invalid memory key: ${key}`);
  }
  return `${safe}.json`;
}

export function memoryList(
  scope: "project" | "user",
  repoRoot: string | null,
): MemoryEntry[] {
  const dir = memoryDir(scope, repoRoot);
  if (!isDirectory(dir)) {
    return [];
  }
  const out: MemoryEntry[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) {
      continue;
    }
    const p = join(dir, name);
    try {
      const st = Bun.file(p);
      out.push({
        key: name.replace(/\.json$/, ""),
        path: p,
        scope,
        bytes: st.size,
      });
    } catch {
      // skip
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export function memoryGet(
  key: string,
  scope: "project" | "user",
  repoRoot: string | null,
): MemoryEntry {
  const dir = memoryDir(scope, repoRoot);
  const p = join(dir, keyToFile(key));
  if (!pathExists(p)) {
    throw new LetError("not_found", `Memory key not found: ${key}`, { key });
  }
  const text = readFileSync(p, "utf8");
  let value: unknown = text;
  try {
    value = JSON.parse(text);
  } catch {
    // raw string
  }
  return {
    key,
    path: p,
    scope,
    bytes: text.length,
    value,
  };
}

export function memorySet(
  key: string,
  value: unknown,
  scope: "project" | "user",
  repoRoot: string | null,
): MemoryEntry {
  const dir = memoryDir(scope, repoRoot);
  mkdirSync(dir, { recursive: true });
  const p = join(dir, keyToFile(key));
  const body =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  writeFileSync(p, body.endsWith("\n") ? body : `${body}\n`, "utf8");
  return {
    key,
    path: p,
    scope,
    bytes: body.length,
    value: typeof value === "string" ? value : value,
  };
}

export function memoryDelete(
  key: string,
  scope: "project" | "user",
  repoRoot: string | null,
): { key: string; deleted: boolean; path: string } {
  const dir = memoryDir(scope, repoRoot);
  const p = join(dir, keyToFile(key));
  if (!pathExists(p)) {
    throw new LetError("not_found", `Memory key not found: ${key}`, { key });
  }
  unlinkSync(p);
  return { key, deleted: true, path: p };
}
