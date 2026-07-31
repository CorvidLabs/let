/**
 * Worktree federation: git seeds, host overlays, path-prefix host table.
 */

import { Database } from "bun:sqlite";
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { isDirectory, isImmediateChild, pathExists } from "../fs-scan.ts";
import {
  gitBranch,
  gitCommonDir,
  gitHead,
  gitToplevel,
  gitWorktreeList,
  mapGitStatus,
  safeRealpath,
} from "../git.ts";
import { grokHome } from "../paths.ts";
import { worktreeId } from "./ids.ts";
import { externalWorktreeRoots, inRepoWorktreeBases } from "./scan-policy.ts";
import type { HostId, WorktreeCard, WorktreeStatus } from "./types.ts";

export function attributeHost(path: string, ctx: ScanContext): HostId {
  const rp = safeRealpath(path) ?? path;
  const { codex, cursor } = externalWorktreeRoots();
  const codexRp = safeRealpath(codex) ?? codex;
  const cursorRp = safeRealpath(cursor) ?? cursor;

  if (ctx.repoRoot) {
    for (const b of inRepoWorktreeBases(ctx.repoRoot, ctx.config)) {
      const baseRp = safeRealpath(b.path) ?? b.path;
      if (rp === baseRp || rp.startsWith(`${baseRp}/`)) {
        return b.host;
      }
    }
  }

  if (rp === codexRp || rp.startsWith(`${codexRp}/`)) {
    return "codex";
  }
  if (rp === cursorRp || rp.startsWith(`${cursorRp}/`)) {
    return "cursor";
  }
  return "git";
}

export function isWorktreeCandidateForRepo(
  path: string,
  ctx: ScanContext,
): boolean {
  if (!ctx.repoRoot || !ctx.repoCommonDir) {
    return false;
  }
  const rp = safeRealpath(path) ?? path;

  if (ctx.gitPorcelainPaths?.has(rp)) {
    return true;
  }

  for (const b of inRepoWorktreeBases(ctx.repoRoot, ctx.config)) {
    const baseRp = safeRealpath(b.path) ?? b.path;
    if (isImmediateChild(rp, baseRp)) {
      return true;
    }
  }

  const { codex, cursor } = externalWorktreeRoots();
  const codexRp = safeRealpath(codex) ?? codex;
  const cursorRp = safeRealpath(cursor) ?? cursor;
  const underExternal =
    rp.startsWith(`${codexRp}/`) || rp.startsWith(`${cursorRp}/`);

  if (!underExternal) {
    return false;
  }

  const toplevel = gitToplevel(rp);
  if (!toplevel) {
    return false;
  }
  // Checkout root OR linked worktree root (toplevel == path)
  if (toplevel !== rp) {
    return false;
  }
  const common = gitCommonDir(rp);
  return common !== null && common === ctx.repoCommonDir;
}

function listShallowDirs(dir: string, max: number): string[] {
  if (!pathExists(dir) || !isDirectory(dir)) {
    return [];
  }
  try {
    const names = readdirSync(dir).slice(0, max);
    const out: string[] = [];
    for (const name of names) {
      if (name === ".DS_Store") {
        continue;
      }
      const rp = safeRealpath(join(dir, name));
      if (rp && isDirectory(rp)) {
        out.push(rp);
      }
    }
    return out;
  } catch {
    return [];
  }
}

function overlay(
  card: WorktreeCard,
  hostFromPath: HostId,
  pathExistsOnDisk: boolean,
): void {
  card.meta = card.meta ?? {};
  card.meta.host_dir = pathExistsOnDisk;
  card.meta.git_listed = card.meta.git_listed ?? false;
  card.meta.also_in_git = Boolean(card.meta.git_listed);

  if (hostFromPath !== "unknown" && hostFromPath !== "git") {
    card.host = hostFromPath;
    card.managed_by = hostFromPath;
  }

  if (!card.meta.git_listed) {
    if (pathExistsOnDisk && isDirectory(card.path)) {
      const branch = gitBranch(card.path);
      if (branch) {
        card.branch = branch;
      }
      const head = gitHead(card.path);
      if (head) {
        card.meta.head = head;
      }
      const top = gitToplevel(card.path);
      if (top) {
        card.status = "active";
      } else {
        card.status = "unknown";
        card.meta.non_git = true;
      }
    } else if (!pathExistsOnDisk) {
      card.status = "missing";
    } else {
      card.status = "unknown";
      card.meta.non_git = true;
    }
  } else if (!pathExistsOnDisk) {
    card.status = "missing";
  }
}

function hostOnlyCard(
  rp: string,
  host: HostId,
  ctx: ScanContext,
): WorktreeCard {
  const card: WorktreeCard = {
    id: worktreeId(rp),
    kind: "worktrees",
    host,
    managed_by: host,
    name: basename(rp),
    path: rp,
    scope: ctx.scope === "project" ? "project" : "user",
    status: "unknown",
    repo_root: ctx.repoRoot ?? undefined,
    meta: {
      git_listed: false,
      host_dir: true,
    },
  };
  overlay(card, host, pathExists(rp));
  return card;
}

function seedFromGit(ctx: ScanContext): Map<string, WorktreeCard> {
  const cards = new Map<string, WorktreeCard>();
  if (!ctx.repoRoot) {
    return cards;
  }
  const entries = gitWorktreeList(ctx.repoRoot);
  ctx.gitPorcelainPaths = new Set(entries.map((e) => e.path));

  for (const entry of entries) {
    const rp = entry.path;
    const host = attributeHost(rp, ctx);
    const status: WorktreeStatus = mapGitStatus(entry);
    cards.set(rp, {
      id: worktreeId(rp),
      kind: "worktrees",
      host,
      managed_by: host === "git" ? "unknown" : host,
      name: basename(rp),
      path: rp,
      scope: "project",
      branch: entry.branch,
      status,
      repo_root: ctx.repoRoot,
      meta: {
        git_listed: true,
        host_dir: false,
        head: entry.head,
        detached: entry.detached,
      },
    });
  }
  return cards;
}

function listHostCandidates(
  ctx: ScanContext,
): { path: string; host: HostId }[] {
  const out: { path: string; host: HostId }[] = [];
  const max = ctx.policy.maxEntriesPerRoot;

  if (ctx.repoRoot) {
    for (const b of inRepoWorktreeBases(ctx.repoRoot, ctx.config)) {
      for (const c of listShallowDirs(b.path, max)) {
        out.push({ path: c, host: b.host });
      }
    }
  }

  const codexRoot = externalWorktreeRoots().codex;
  for (const idDir of listShallowDirs(codexRoot, max)) {
    for (const repoDir of listShallowDirs(idDir, max)) {
      out.push({ path: repoDir, host: "codex" });
      for (const n of listShallowDirs(join(repoDir, ".worktrees"), max)) {
        out.push({ path: n, host: "codex" });
      }
    }
  }

  const cursorRoot = externalWorktreeRoots().cursor;
  for (const child of listShallowDirs(cursorRoot, max)) {
    out.push({ path: child, host: "cursor" });
    for (const n of listShallowDirs(child, max)) {
      out.push({ path: n, host: "cursor" });
    }
  }

  return out;
}

function enrichFromGrokDb(
  cards: Map<string, WorktreeCard>,
  ctx: ScanContext,
): void {
  const dbPath = join(grokHome(), "worktrees.db");
  if (!pathExists(dbPath)) {
    return;
  }
  try {
    const db = new Database(dbPath, { readonly: true });
    let rows: {
      path: string;
      source_repo?: string;
      repo_name?: string;
      kind?: string;
      status?: string;
      session_id?: string;
    }[] = [];
    try {
      rows = db
        .query(
          `SELECT path, source_repo, repo_name, kind, status, session_id FROM worktrees LIMIT 500`,
        )
        .all() as typeof rows;
    } catch {
      try {
        rows = db
          .query(`SELECT path FROM worktrees LIMIT 500`)
          .all() as typeof rows;
      } catch {
        db.close();
        return;
      }
    }
    db.close();

    for (const row of rows) {
      if (!row.path) {
        continue;
      }
      const rp = safeRealpath(row.path);
      if (!rp) {
        continue;
      }
      const summary = {
        source_repo: row.source_repo,
        repo_name: row.repo_name,
        kind: row.kind,
        status: row.status,
        session_id: row.session_id,
      };
      if (cards.has(rp)) {
        const card = cards.get(rp);
        if (card) {
          card.meta = { ...card.meta, grok_db: summary };
          if (card.host === "git") {
            card.host = "grok";
          }
        }
        continue;
      }
      if (ctx.scope === "project" && !isWorktreeCandidateForRepo(rp, ctx)) {
        continue;
      }
      const card = hostOnlyCard(rp, "grok", ctx);
      card.meta = { ...card.meta, grok_db: summary };
      cards.set(rp, card);
    }
  } catch {
    // optional
  }
}

export function federateWorktrees(ctx: ScanContext): {
  cards: WorktreeCard[];
  total: number;
  truncated: boolean;
} {
  const cards = seedFromGit(ctx);

  for (const [rp, card] of cards) {
    const host = attributeHost(rp, ctx);
    if (host !== "git") {
      card.host = host;
      card.managed_by = host;
      card.meta = { ...card.meta, host_dir: pathExists(rp) };
    }
  }

  for (const { path: cand, host } of listHostCandidates(ctx)) {
    const rp = safeRealpath(cand) ?? cand;
    if (ctx.scope === "project" && !isWorktreeCandidateForRepo(rp, ctx)) {
      continue;
    }
    const existing = cards.get(rp);
    if (existing) {
      overlay(existing, host, pathExists(rp));
    } else {
      cards.set(rp, hostOnlyCard(rp, host, ctx));
    }
  }

  enrichFromGrokDb(cards, ctx);

  const sorted = [...cards.values()].sort((a, b) => {
    const aLocal = a.repo_root === ctx.repoRoot ? 0 : 1;
    const bLocal = b.repo_root === ctx.repoRoot ? 0 : 1;
    if (aLocal !== bLocal) {
      return aLocal - bLocal;
    }
    if (a.host !== b.host) {
      return a.host.localeCompare(b.host);
    }
    return a.name.localeCompare(b.name);
  });

  const limit = ctx.limit;
  const total = sorted.length;
  const truncated = total > limit;
  return {
    cards: truncated ? sorted.slice(0, limit) : sorted,
    total,
    truncated,
  };
}
