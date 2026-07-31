/**
 * Discover instruction files for a project.
 */

import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { mtimeMs, pathExists } from "../fs-scan.ts";
import { findGeminiInstructions } from "./gemini.ts";
import { instructionId } from "./ids.ts";
import type { HostId, IndexCard } from "./types.ts";

const ROOT_NAMES = [
  "CLAUDE.md",
  "AGENTS.md",
  "AGENT.md",
  ".cursorrules",
  "GEMINI.md",
  "CODEX.md",
];

function hostForInstructionName(name: string): HostId {
  if (name.startsWith(".cursor") || name === ".cursorrules") {
    return "cursor";
  }
  if (name === "CLAUDE.md") {
    return "claude";
  }
  if (name === "GEMINI.md") {
    return "gemini";
  }
  if (name === "CODEX.md" || name === "AGENTS.md" || name === "AGENT.md") {
    return "project";
  }
  return "project";
}

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
        host: hostForInstructionName(name),
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

    // project .gemini dir
    const geminiDir = join(root, ".gemini");
    if (pathExists(geminiDir)) {
      cards.push({
        id: instructionId(geminiDir),
        kind: "instructions",
        host: "gemini",
        name: ".gemini",
        path: geminiDir,
        scope: "project",
        repo_root: ctx.repoRoot ?? undefined,
        mtime_ms: mtimeMs(geminiDir),
      });
    }
  }

  cards.push(...findGeminiInstructions(ctx));

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
