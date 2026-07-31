/**
 * Stable card ids. Worktree ids are path-hash only (no host).
 */

import { createHash } from "node:crypto";
import type { HostId } from "./types.ts";

export function hash16(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}

export function hash12(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

export function worktreeId(realpath: string): string {
  return `worktrees:${hash16(realpath)}`;
}

export function skillId(host: HostId, name: string, realpath: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `skills:${host}:${slug || "unnamed"}:${hash12(realpath)}`;
}

export function instructionId(realpath: string): string {
  return `instructions:${hash16(realpath)}`;
}

export function pathCardId(kind: string, realpath: string): string {
  return `${kind}:${hash16(realpath)}`;
}
