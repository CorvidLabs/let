/**
 * Shallow directory listing helpers with ScanPolicy confinement.
 */

import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import type { ScanPolicy } from "./catalog/scan-policy.ts";
import { isDeniedBasename } from "./catalog/scan-policy.ts";
import { safeRealpath } from "./git.ts";

export function pathExists(path: string): boolean {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function mtimeMs(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return undefined;
  }
}

export function fileBytes(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return undefined;
  }
}

/**
 * List immediate children of dir (names). Empty if missing/not dir.
 */
export function listDirNames(dir: string, max: number): string[] {
  try {
    if (!isDirectory(dir)) {
      return [];
    }
    return readdirSync(dir).slice(0, max);
  } catch {
    return [];
  }
}

/**
 * List absolute child paths of dir that are directories (or all if files ok).
 * Skips symlinks that escape root when policy.followSymlinks is within-root.
 */
export function listChildPaths(
  dir: string,
  policy: ScanPolicy,
  opts: { directoriesOnly?: boolean } = {},
): string[] {
  const rootRp = safeRealpath(dir);
  if (!rootRp || !isDirectory(rootRp)) {
    return [];
  }
  const names = listDirNames(rootRp, policy.maxEntriesPerRoot);
  const out: string[] = [];
  for (const name of names) {
    if (name === ".DS_Store" || name === "." || name === "..") {
      continue;
    }
    if (isDeniedBasename(name, policy)) {
      continue;
    }
    const child = join(rootRp, name);
    try {
      const st = lstatSync(child);
      if (st.isSymbolicLink()) {
        const target = safeRealpath(child);
        if (!target) {
          continue;
        }
        if (policy.followSymlinks === "never") {
          continue;
        }
        // within-root: target must stay under rootRp
        if (!isPathInside(target, rootRp)) {
          continue;
        }
        if (opts.directoriesOnly && !isDirectory(target)) {
          continue;
        }
        out.push(target);
        continue;
      }
      if (opts.directoriesOnly && !st.isDirectory()) {
        continue;
      }
      const rp = safeRealpath(child) ?? child;
      out.push(rp);
    } catch {}
  }
  return out;
}

export function isPathInside(child: string, parent: string): boolean {
  const c = resolve(child);
  const p = resolve(parent);
  if (c === p) {
    return true;
  }
  const rel = relative(p, c);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== "..";
}

export function isImmediateChild(child: string, parent: string): boolean {
  const c = safeRealpath(child) ?? resolve(child);
  const p = safeRealpath(parent) ?? resolve(parent);
  if (!c.startsWith(p + sep) && c !== p) {
    // also handle non-realpath
  }
  const rel = relative(p, c);
  return rel !== "" && !rel.includes("..") && !rel.includes(sep);
}

/**
 * Read text file; null on failure / deny.
 * When allowPartial is true and the file is larger than maxBytes, returns the
 * first maxBytes of UTF-8 content (best-effort; may split a multi-byte char).
 */
export function readTextFile(
  path: string,
  policy: ScanPolicy,
  maxBytes = 256_000,
  opts: { allowPartial?: boolean } = {},
): string | null {
  const name = basename(path);
  if (isDeniedBasename(name, policy)) {
    return null;
  }
  try {
    const st = statSync(path);
    if (!st.isFile()) {
      return null;
    }
    if (st.size <= maxBytes) {
      return readFileSync(path, "utf8");
    }
    if (!opts.allowPartial) {
      return null;
    }
    // Cap: read only the prefix so large skills still progressive-disclose.
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(maxBytes);
      const n = readSync(fd, buf, 0, maxBytes, 0);
      return buf.subarray(0, n).toString("utf8");
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Parse YAML-ish frontmatter name/description from SKILL.md. */
export function parseSkillFrontmatter(text: string): {
  name?: string;
  description?: string;
} {
  if (!text.startsWith("---")) {
    return {};
  }
  const end = text.indexOf("\n---", 3);
  if (end < 0) {
    return {};
  }
  const block = text.slice(3, end);
  let name: string | undefined;
  let description: string | undefined;
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) {
      continue;
    }
    const key = m[1]?.toLowerCase();
    let val = (m[2] ?? "").trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key === "name") {
      name = val;
    }
    if (key === "description") {
      description = val;
    }
  }
  return { name, description };
}

export function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(resolve(path));
  } catch {
    return null;
  }
}
