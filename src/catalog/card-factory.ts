/**
 * Shared IndexCard builders for federated host adapters.
 */

import { basename } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { fileBytes, mtimeMs } from "../fs-scan.ts";
import { pathCardId } from "./ids.ts";
import { underRepo } from "./scope.ts";
import type { CardScope, FindKind, HostId, IndexCard } from "./types.ts";

export type CardOpts = {
  kind: FindKind;
  host: HostId;
  path: string;
  name?: string;
  description?: string;
  triggers?: string[];
  scope?: CardScope;
  pathOnly?: boolean;
  meta?: Record<string, unknown>;
  repoRoot?: string | null;
};

export function makeCard(opts: CardOpts, ctx?: ScanContext): IndexCard {
  const inRepo = ctx ? underRepo(opts.path, ctx) : Boolean(opts.repoRoot);
  const scope = opts.scope ?? (opts.repoRoot || inRepo ? "project" : "user");
  const repo_root =
    scope === "project"
      ? (opts.repoRoot ?? ctx?.repoRoot ?? undefined)
      : undefined;

  return {
    id: pathCardId(opts.kind, opts.path),
    kind: opts.kind,
    host: opts.host,
    name: opts.name ?? basename(opts.path),
    path: opts.path,
    scope,
    description: opts.description,
    triggers: opts.triggers,
    repo_root,
    mtime_ms: mtimeMs(opts.path),
    meta: {
      ...(opts.pathOnly
        ? {
            path_only: true,
            bytes: fileBytes(opts.path),
          }
        : {}),
      ...opts.meta,
    },
  };
}

/** Dedupe cards by id (path-hash). First wins. */
export function dedupeCards(cards: IndexCard[]): IndexCard[] {
  const seen = new Set<string>();
  const out: IndexCard[] = [];
  for (const c of cards) {
    if (seen.has(c.id)) {
      continue;
    }
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

/** Stable sort: project first, then host, then name. */
export function sortCards(cards: IndexCard[]): IndexCard[] {
  return [...cards].sort((a, b) => {
    const aLocal = a.scope === "project" ? 0 : 1;
    const bLocal = b.scope === "project" ? 0 : 1;
    if (aLocal !== bLocal) {
      return aLocal - bLocal;
    }
    if (a.host !== b.host) {
      return a.host.localeCompare(b.host);
    }
    return a.name.localeCompare(b.name);
  });
}
