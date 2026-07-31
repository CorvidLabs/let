/**
 * Discover instruction files for a project.
 */

import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { mtimeMs, pathExists } from "../fs-scan.ts";
import { instructionId } from "./ids.ts";
import type { IndexCard } from "./types.ts";

const ROOT_NAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  "AGENT.md",
  ".cursorrules",
  "GEMINI.md",
  "CODEX.md",
];

export function findInstructions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const roots = new Set<string>();
  if (ctx.repoRoot) {
    roots.add(ctx.repoRoot);
  }
  roots.add(ctx.cwd);

  for (const root of roots) {
    for (const name of ROOT_NAMES) {
      const p = join(root, name);
      if (!pathExists(p)) {
        continue;
      }
      cards.push({
        id: instructionId(p),
        kind: "instructions",
        host:
          name.startsWith(".cursor") || name === ".cursorrules"
            ? "cursor"
            : "project",
        name,
        path: p,
        scope: "project",
        repo_root: ctx.repoRoot ?? undefined,
        mtime_ms: mtimeMs(p),
        meta: { basename: basename(p) },
      });
    }

    // .cursor/rules (dir or files)
    const cursorRules = join(root, ".cursor", "rules");
    if (pathExists(cursorRules)) {
      cards.push({
        id: instructionId(cursorRules),
        kind: "instructions",
        host: "cursor",
        name: ".cursor/rules",
        path: cursorRules,
        scope: "project",
        repo_root: ctx.repoRoot ?? undefined,
        mtime_ms: mtimeMs(cursorRules),
      });
    }

    // .claude settings as weak instruction signals
    for (const rel of [
      ".claude/settings.json",
      ".claude/settings.local.json",
    ]) {
      const p = join(root, rel);
      if (pathExists(p)) {
        cards.push({
          id: instructionId(p),
          kind: "instructions",
          host: "claude",
          name: rel,
          path: p,
          scope: "project",
          repo_root: ctx.repoRoot ?? undefined,
          mtime_ms: mtimeMs(p),
        });
      }
    }
  }

  // dedupe by path
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.path)) {
      return false;
    }
    seen.add(c.path);
    return true;
  });
}
