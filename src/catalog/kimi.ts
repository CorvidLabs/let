/**
 * Kimi Code host adapter — ~/.kimi-code
 * Sessions are path-only; never read credentials/oauth.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import { fileBytes, isDirectory, mtimeMs, pathExists } from "../fs-scan.ts";
import { safeRealpath } from "../git.ts";
import { kimiHome } from "../paths.ts";
import { pathCardId } from "./ids.ts";
import type { IndexCard } from "./types.ts";

type KimiWorkspace = {
  root: string;
  name: string;
  created_at?: string;
  last_opened_at?: string;
};

type KimiWorkspacesFile = {
  version?: number;
  workspaces?: Record<string, KimiWorkspace>;
};

function loadWorkspaces(): {
  byId: Map<string, KimiWorkspace>;
  byRoot: Map<string, { id: string; ws: KimiWorkspace }>;
} {
  const byId = new Map<string, KimiWorkspace>();
  const byRoot = new Map<string, { id: string; ws: KimiWorkspace }>();
  const p = join(kimiHome(), "workspaces.json");
  if (!pathExists(p)) {
    return { byId, byRoot };
  }
  try {
    const raw = JSON.parse(readFileSync(p, "utf8")) as KimiWorkspacesFile;
    for (const [id, ws] of Object.entries(raw.workspaces ?? {})) {
      byId.set(id, ws);
      const root = safeRealpath(ws.root) ?? ws.root;
      byRoot.set(root, { id, ws });
    }
  } catch {
    // ignore
  }
  return { byId, byRoot };
}

function sessionIndexLines(): {
  sessionId: string;
  sessionDir: string;
  workDir: string;
}[] {
  const p = join(kimiHome(), "session_index.jsonl");
  if (!pathExists(p)) {
    return [];
  }
  try {
    const text = readFileSync(p, "utf8");
    const out: { sessionId: string; sessionDir: string; workDir: string }[] =
      [];
    for (const line of text.split("\n").slice(0, 500)) {
      if (!line.trim()) {
        continue;
      }
      try {
        const row = JSON.parse(line) as {
          sessionId?: string;
          sessionDir?: string;
          workDir?: string;
        };
        if (row.sessionId && row.sessionDir) {
          out.push({
            sessionId: row.sessionId,
            sessionDir: row.sessionDir,
            workDir: row.workDir ?? "",
          });
        }
      } catch {
        // skip line
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function findKimiSessions(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const home = kimiHome();
  if (!pathExists(home)) {
    return cards;
  }

  const { byRoot, byId } = loadWorkspaces();
  const repoRp = ctx.repoRoot
    ? (safeRealpath(ctx.repoRoot) ?? ctx.repoRoot)
    : null;

  if (ctx.scope === "project" && repoRp) {
    const bound = byRoot.get(repoRp);
    if (bound) {
      const sessRoot = join(home, "sessions", bound.id);
      if (isDirectory(sessRoot)) {
        try {
          for (const name of readdirSync(sessRoot).slice(
            0,
            ctx.policy.maxEntriesPerRoot,
          )) {
            if (!name.startsWith("session_")) {
              continue;
            }
            const p = join(sessRoot, name);
            cards.push({
              id: pathCardId("sessions", p),
              kind: "sessions",
              host: "kimi",
              name,
              path: p,
              scope: "project",
              repo_root: ctx.repoRoot ?? undefined,
              mtime_ms: mtimeMs(p),
              meta: {
                path_only: true,
                workspace_id: bound.id,
                workspace_name: bound.ws.name,
              },
            });
          }
        } catch {
          // skip
        }
      }
      // workspace card itself
      cards.push({
        id: pathCardId("sessions", `kimi-ws:${bound.id}`),
        kind: "sessions",
        host: "kimi",
        name: `workspace:${bound.ws.name}`,
        path: bound.ws.root,
        scope: "project",
        repo_root: ctx.repoRoot ?? undefined,
        meta: {
          path_only: true,
          kind: "workspace",
          workspace_id: bound.id,
        },
      });
    }

    // Also match session_index by workDir
    for (const row of sessionIndexLines()) {
      const wd = safeRealpath(row.workDir) ?? row.workDir;
      if (wd !== repoRp) {
        continue;
      }
      if (!pathExists(row.sessionDir)) {
        continue;
      }
      // avoid dups
      if (cards.some((c) => c.path === row.sessionDir)) {
        continue;
      }
      cards.push({
        id: pathCardId("sessions", row.sessionDir),
        kind: "sessions",
        host: "kimi",
        name: row.sessionId,
        path: row.sessionDir,
        scope: "project",
        repo_root: ctx.repoRoot ?? undefined,
        mtime_ms: mtimeMs(row.sessionDir),
        meta: { path_only: true, from: "session_index" },
      });
    }
  }

  if (ctx.scope === "user" || ctx.scope === "all") {
    for (const [id, ws] of byId) {
      cards.push({
        id: pathCardId("sessions", `kimi-ws:${id}`),
        kind: "sessions",
        host: "kimi",
        name: `workspace:${ws.name}`,
        path: ws.root,
        scope: "user",
        meta: {
          path_only: true,
          kind: "workspace",
          workspace_id: id,
          last_opened_at: ws.last_opened_at,
        },
      });
    }
    // shallow list workspace session roots
    const sessionsRoot = join(home, "sessions");
    if (isDirectory(sessionsRoot)) {
      try {
        for (const name of readdirSync(sessionsRoot).slice(
          0,
          ctx.policy.maxEntriesPerRoot,
        )) {
          const p = join(sessionsRoot, name);
          if (!isDirectory(p)) {
            continue;
          }
          cards.push({
            id: pathCardId("sessions", p),
            kind: "sessions",
            host: "kimi",
            name,
            path: p,
            scope: "user",
            mtime_ms: mtimeMs(p),
            meta: {
              path_only: true,
              kind: "workspace_sessions_dir",
              bytes: fileBytes(p),
            },
          });
        }
      } catch {
        // skip
      }
    }
  }

  return cards;
}

export function findKimiAgents(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const wantUser =
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    (ctx.scope === "project" && ctx.config.find.include_user_skills);
  if (!wantUser || !pathExists(kimiHome())) {
    return cards;
  }

  // config as agent identity surface (path-only — may contain keys; do not show body)
  const config = join(kimiHome(), "config.toml");
  if (pathExists(config)) {
    cards.push({
      id: pathCardId("agents", config),
      kind: "agents",
      host: "kimi",
      name: "kimi-code-config",
      path: config,
      scope: "user",
      mtime_ms: mtimeMs(config),
      meta: {
        path_only: true,
        note: "config may contain secrets — show is metadata-only",
      },
    });
  }

  // user-history as path-only agent memory adjacent
  const history = join(kimiHome(), "user-history");
  if (isDirectory(history)) {
    cards.push({
      id: pathCardId("agents", history),
      kind: "agents",
      host: "kimi",
      name: "user-history",
      path: history,
      scope: "user",
      mtime_ms: mtimeMs(history),
      meta: { path_only: true, source: "kimi.user-history" },
    });
  }

  return cards;
}

/** user-history entries as memory (path-only). */
export function findKimiMemory(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  const wantUser =
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    (ctx.scope === "project" && ctx.config.find.include_user_skills);
  if (!wantUser) {
    return cards;
  }
  const history = join(kimiHome(), "user-history");
  if (!isDirectory(history)) {
    return cards;
  }
  try {
    for (const name of readdirSync(history).slice(
      0,
      ctx.policy.maxEntriesPerRoot,
    )) {
      const p = join(history, name);
      cards.push({
        id: pathCardId("memory", p),
        kind: "memory",
        host: "kimi",
        name,
        path: p,
        scope: "user",
        mtime_ms: mtimeMs(p),
        meta: {
          path_only: true,
          source: "kimi.user-history",
          bytes: fileBytes(p),
        },
      });
    }
  } catch {
    // skip
  }
  return cards;
}
