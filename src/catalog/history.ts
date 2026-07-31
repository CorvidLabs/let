/**
 * `let history` / usage report — rank hosts and projects by activity mtime.
 * Path-only metadata; never loads session bodies.
 */

import type { ScanContext } from "../adapters/types.ts";
import { decodeClaudeProjectPath } from "../paths.ts";
import { findAssets } from "./find.ts";
import type { HostId, IndexCard } from "./types.ts";

export type HostUsage = {
  host: HostId | string;
  session_cards: number;
  latest_mtime_ms?: number;
  latest_iso?: string;
  sample_names: string[];
};

export type ProjectUsage = {
  repo_root: string;
  hosts: string[];
  session_cards: number;
  latest_mtime_ms?: number;
  latest_iso?: string;
};

export type HistoryReport = {
  cwd: string;
  repo_root: string | null;
  scope: string;
  hosts: HostUsage[];
  projects: ProjectUsage[];
  totals: {
    session_cards: number;
    hosts_with_activity: number;
    projects_with_activity: number;
  };
  /** Always true: no transcript bodies in this report. */
  path_only: true;
};

function iso(ms?: number): string | undefined {
  if (ms === undefined || !Number.isFinite(ms) || ms <= 0) {
    return undefined;
  }
  try {
    return new Date(ms).toISOString();
  } catch {
    return undefined;
  }
}

/** Infer project root from path-only session cards when repo_root is absent. */
function inferRepoRoot(card: IndexCard): string | undefined {
  if (card.repo_root) {
    return card.repo_root;
  }
  const p = card.path.replace(/\\/g, "/");

  // Grok: ~/.grok/sessions/<encodeURIComponent(absPath)>
  if (p.includes("/.grok/sessions/")) {
    const leaf = p.split("/.grok/sessions/")[1]?.split("/")[0];
    if (leaf?.startsWith("%2F")) {
      try {
        return decodeURIComponent(leaf);
      } catch {
        // ignore
      }
    }
  }

  // Claude: ~/.claude/projects/<encoded> or jsonl under that dir
  if (p.includes("/.claude/projects/")) {
    const enc = p.split("/.claude/projects/")[1]?.split("/")[0];
    if (enc) {
      const decoded = decodeClaudeProjectPath(enc);
      if (decoded) {
        return decoded;
      }
    }
  }

  // Kimi: workspace root paths (not under ~/.kimi-code)
  if (
    card.host === "kimi" &&
    p.startsWith("/") &&
    !p.includes("/.kimi-code/")
  ) {
    return p;
  }

  // Gemini projects.json cards use path as project root
  if (card.host === "gemini" && p.startsWith("/") && !p.includes("/.gemini/")) {
    return p;
  }

  // Codex checkout dirs under worktrees (not session jsonl)
  if (
    p.includes("/.codex/worktrees/") &&
    !p.endsWith(".jsonl") &&
    !p.includes("/sessions/")
  ) {
    return p;
  }

  // Card name sometimes is the absolute path (decoded grok bucket)
  if (card.name.startsWith("/") && card.name.includes("/")) {
    return card.name;
  }
  return undefined;
}

function collectSessions(cards: IndexCard[]): {
  hosts: Map<string, HostUsage>;
  projects: Map<string, ProjectUsage>;
} {
  const hosts = new Map<string, HostUsage>();
  const projects = new Map<string, ProjectUsage>();

  for (const c of cards) {
    const h = c.host;
    let hu = hosts.get(h);
    if (!hu) {
      hu = { host: h, session_cards: 0, sample_names: [] };
      hosts.set(h, hu);
    }
    hu.session_cards++;
    const m = c.mtime_ms;
    if (
      m !== undefined &&
      (hu.latest_mtime_ms === undefined || m > hu.latest_mtime_ms)
    ) {
      hu.latest_mtime_ms = m;
      hu.latest_iso = iso(m);
    }
    if (hu.sample_names.length < 5 && c.name) {
      hu.sample_names.push(c.name);
    }

    const root = inferRepoRoot(c);
    if (root) {
      let pu = projects.get(root);
      if (!pu) {
        pu = {
          repo_root: root,
          hosts: [],
          session_cards: 0,
        };
        projects.set(root, pu);
      }
      pu.session_cards++;
      if (!pu.hosts.includes(h)) {
        pu.hosts.push(h);
      }
      if (
        m !== undefined &&
        (pu.latest_mtime_ms === undefined || m > pu.latest_mtime_ms)
      ) {
        pu.latest_mtime_ms = m;
        pu.latest_iso = iso(m);
      }
    }
  }

  return { hosts, projects };
}

/**
 * Build a usage/history report from federated session cards (path-only).
 * scope user|all recommended for full Mac picture; project for one repo.
 */
export async function buildHistory(ctx: ScanContext): Promise<HistoryReport> {
  // High limit for ranking; still path-only cards
  const wide: ScanContext = { ...ctx, limit: 500 };
  const found = await findAssets("sessions", wide);
  const { hosts, projects } = collectSessions(found.items);

  const hostList = [...hosts.values()].sort((a, b) => {
    const am = a.latest_mtime_ms ?? 0;
    const bm = b.latest_mtime_ms ?? 0;
    if (bm !== am) {
      return bm - am;
    }
    return b.session_cards - a.session_cards;
  });

  const projectList = [...projects.values()].sort((a, b) => {
    const am = a.latest_mtime_ms ?? 0;
    const bm = b.latest_mtime_ms ?? 0;
    if (bm !== am) {
      return bm - am;
    }
    return b.session_cards - a.session_cards;
  });

  return {
    cwd: ctx.cwd,
    repo_root: ctx.repoRoot,
    scope: ctx.scope,
    hosts: hostList,
    projects: projectList.slice(0, ctx.limit),
    totals: {
      session_cards: found.total,
      hosts_with_activity: hostList.length,
      projects_with_activity: projectList.length,
    },
    path_only: true,
  };
}
