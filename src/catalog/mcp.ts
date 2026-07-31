/**
 * Federated MCP config discovery across hosts (path-only cards).
 */

import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { pathExists } from "../fs-scan.ts";
import { dedupeCards, makeCard } from "./card-factory.ts";
import { findClaudeMcp } from "./claude.ts";
import { findCodexMcp } from "./codex.ts";
import { findCursorMcp } from "./cursor.ts";
import { findGeminiAgents } from "./gemini.ts";
import { wantProject } from "./scope.ts";
import type { IndexCard } from "./types.ts";

/** Project-root MCP manifests (host-neutral / project). */
function findProjectMcp(ctx: ScanContext): IndexCard[] {
  if (!wantProject(ctx) || !ctx.repoRoot) {
    return [];
  }
  const cards: IndexCard[] = [];
  for (const name of [".mcp.json", "mcp.json", ".vscode/mcp.json"]) {
    const p = join(ctx.repoRoot, name);
    if (!pathExists(p)) {
      continue;
    }
    cards.push(
      makeCard({
        kind: "mcp",
        host: "project",
        path: p,
        name,
        scope: "project",
        repoRoot: ctx.repoRoot,
        pathOnly: true,
        meta: { source: "project.mcp", standard: "let" },
      }),
    );
  }
  return cards;
}

export function findMcpConfigs(ctx: ScanContext): IndexCard[] {
  const geminiMcp = findGeminiAgents(ctx).filter((c) => c.kind === "mcp");
  return dedupeCards([
    ...findProjectMcp(ctx),
    ...findClaudeMcp(ctx),
    ...findCursorMcp(ctx),
    ...findCodexMcp(ctx),
    ...geminiMcp,
  ]);
}
