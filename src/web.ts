/**
 * Local-only read-only web view for Let's federated discovery index.
 * It intentionally uses index cards only: no session bodies, terminal output,
 * filesystem paths, shell endpoints, or agent-control actions are exposed.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { buildScanContext } from "./catalog/context-builder.ts";
import { findAssets } from "./catalog/find.ts";
import type { IndexCard } from "./catalog/types.ts";
import { fleetAdapterFor, fleetSessionDetail } from "./fleet-adapters.ts";
import { CORVID_THEME_JS, CORVID_TOKENS_CSS } from "./fleet-brand.ts";

export type FleetFreshness = "live" | "recent" | "stale" | "unknown";
export type FleetState = "recent" | "history";

export type FleetSession = {
  provider: string;
  name: string;
  freshness: FleetFreshness;
  activity: string;
};

export type LiveAgent = {
  agent: "Grok" | "Claude" | "Codex" | "Cursor" | "Gemini" | "Antigravity";
  cwd: string;
  operation?:
    | "Verifying a Spec Sync change"
    | "Working in project"
    | "Antigravity session details unavailable";
  command?: string;
  startedAt?: string;
};

export type WorkingAgent = Omit<LiveAgent, "cwd"> & {
  repo: string;
  worktree: string | null;
  branch: string | null;
  matched: boolean;
};

export type FleetAgentActivity = {
  agent: LiveAgent["agent"];
  status: "working" | "recent" | "history";
  operation: string;
  project: string | null;
  worktree: string | null;
  branch: string | null;
  evidence: "Local process" | "Session metadata" | "Adapter unavailable";
  lastAction: string;
  command: string | null;
  startedAt: string | null;
  latestMessage: string | null;
  recentActivity: string[];
  detailAvailability: "available" | "unavailable";
};

export type FleetWorktree = {
  provider: string;
  worktree: string;
  branch: string;
  status: string;
};

export type FleetRepository = {
  project: string;
  state: FleetState;
  activity: string;
  worktrees: FleetWorktree[];
  sessions: FleetSession[];
  instructions: Array<{ name: string; provider: string; scope: string }>;
  skills: Array<{ name: string; provider: string; scope: string }>;
};

export type FleetSnapshot = {
  source: "let";
  generatedAt: string;
  refreshSeconds: number;
  recentActivity: FleetRepository[];
  history: FleetRepository[];
  unmatchedSessions: FleetSession[];
  workingNow: WorkingAgent[];
  agents: FleetAgentActivity[];
  liveProcessDetection: "local-process";
  policy: string;
};

function freshness(
  mtime: number | undefined,
  now = Date.now(),
): {
  freshness: FleetFreshness;
  activity: string;
} {
  if (!mtime) {
    return { freshness: "unknown", activity: "Unknown" };
  }
  const age = Math.max(0, now - mtime);
  if (age < 60_000) {
    return { freshness: "live", activity: "Just now" };
  }
  if (age < 3_600_000) {
    return {
      freshness: "recent",
      activity: `${Math.floor(age / 60_000)}m ago`,
    };
  }
  if (age < 86_400_000) {
    return {
      freshness: "stale",
      activity: `${Math.floor(age / 3_600_000)}h ago`,
    };
  }
  return {
    freshness: "stale",
    activity: `${Math.floor(age / 86_400_000)}d ago`,
  };
}

function projectName(card: IndexCard): string {
  return basename(repositoryPath(card));
}

function repositoryPath(card: IndexCard): string {
  const marker = "/.worktrees/";
  const worktreeMarker = card.path.lastIndexOf(marker);
  if (worktreeMarker >= 0) {
    return card.path.slice(0, worktreeMarker);
  }
  const codex = card.path.match(/\/\.codex\/worktrees\/[^/]+\/([^/]+)/);
  if (codex?.[1]) {
    return codex[1];
  }
  return card.repo_root && basename(card.repo_root) !== "let"
    ? card.repo_root
    : card.path;
}

export function parseLocalAgentProcessLines(
  output: string,
  cwdForPid: (pid: string) => string | null,
  isProjectCwd: (cwd: string) => boolean = () => true,
): LiveAgent[] {
  const providers: Record<string, LiveAgent["agent"]> = {
    grok: "Grok",
    claude: "Claude",
    codex: "Codex",
    cursor: "Cursor",
    gemini: "Gemini",
    antigravity: "Antigravity",
    "antigravity-cli": "Antigravity",
  };
  return output
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(.+)$/))
    .flatMap((match) => {
      if (!match?.[1] || !match[2]) {
        return [];
      }
      const executable = basename(match[2]).toLowerCase();
      const agent = providers[executable];
      const cwd = agent ? cwdForPid(match[1]) : null;
      if (!agent || !cwd) {
        return [];
      }
      // GUI/app helper processes can share a Codex/Cursor binary name. Only
      // accept those providers when their cwd is a real project checkout.
      if ((agent === "Codex" || agent === "Cursor") && !isProjectCwd(cwd)) {
        return [];
      }
      return [{ agent, cwd }];
    })
    .slice(0, 20);
}

export function selectAgentWorkContext(
  rootCwd: string,
  descendants: Array<{ command: string; cwd: string | null }>,
): Pick<LiveAgent, "cwd" | "operation"> {
  const verifier = descendants.findLast(
    (child) =>
      child.cwd !== null &&
      /\bspecsync\b[\s\S]*\bchange\s+check\b/i.test(child.command),
  );
  if (verifier?.cwd) {
    return {
      cwd: verifier.cwd,
      operation: "Verifying a Spec Sync change",
    };
  }
  return { cwd: rootCwd, operation: "Working in project" };
}

function readLiveAgents(): LiveAgent[] {
  try {
    const processList = Bun.spawnSync({
      cmd: ["ps", "-axo", "pid=,ppid=,comm=,command="],
    });
    if (processList.exitCode !== 0) {
      return [];
    }
    const providers: Record<string, LiveAgent["agent"]> = {
      grok: "Grok",
      claude: "Claude",
      codex: "Codex",
      cursor: "Cursor",
      gemini: "Gemini",
      antigravity: "Antigravity",
      "antigravity-cli": "Antigravity",
    };
    const rows = new TextDecoder()
      .decode(processList.stdout)
      .split("\n")
      .flatMap((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
        return match?.[1] && match[2] && match[3] && match[4]
          ? [
              {
                pid: match[1],
                parentPid: match[2],
                executable: match[3],
                command: match[4],
              },
            ]
          : [];
      });
    const cwdForPid = (pid: string): string | null => {
      const cwd = Bun.spawnSync({
        cmd: ["lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"],
      });
      const line = new TextDecoder()
        .decode(cwd.stdout)
        .split("\n")
        .find((item) => item.startsWith("n"));
      return line ? line.slice(1) : null;
    };
    const isProjectCwd = (cwd: string): boolean =>
      Bun.spawnSync({
        cmd: ["git", "-C", cwd, "rev-parse", "--is-inside-work-tree"],
      }).exitCode === 0;
    return rows
      .flatMap((row) => {
        const agent = providers[basename(row.executable).toLowerCase()];
        const rootCwd = agent ? cwdForPid(row.pid) : null;
        if (!agent) {
          return [];
        }
        if (!rootCwd) {
          return agent === "Antigravity"
            ? [
                {
                  agent,
                  cwd: "",
                  operation: "Antigravity session details unavailable" as const,
                },
              ]
            : [];
        }
        if (
          (agent === "Codex" || agent === "Cursor") &&
          !isProjectCwd(rootCwd)
        ) {
          return [];
        }
        const descendants: Array<{ command: string; cwd: string | null }> = [];
        const pending = [row.pid];
        while (pending.length > 0 && descendants.length < 64) {
          const parentPid = pending.shift();
          for (const child of rows.filter(
            (candidate) => candidate.parentPid === parentPid,
          )) {
            pending.push(child.pid);
            descendants.push({
              command: child.command,
              cwd: cwdForPid(child.pid),
            });
          }
        }
        const context = selectAgentWorkContext(rootCwd, descendants);
        const verifier = descendants.findLast(
          (child) =>
            child.cwd === context.cwd &&
            /\bspecsync\b[\s\S]*\bchange\s+check\b/i.test(child.command),
        );
        const started = Bun.spawnSync({
          cmd: ["ps", "-p", row.pid, "-o", "lstart="],
        });
        return [
          {
            agent,
            ...context,
            command: verifier?.command ?? row.command,
            startedAt:
              started.exitCode === 0
                ? new TextDecoder().decode(started.stdout).trim() || undefined
                : undefined,
          },
        ];
      })
      .slice(0, 20);
  } catch {
    return [];
  }
}

function gitLocation(
  cwd: string,
): { repo: string; worktree: string; branch: string } | null {
  const root = Bun.spawnSync({
    cmd: ["git", "-C", cwd, "rev-parse", "--show-toplevel"],
  });
  if (root.exitCode !== 0) {
    return null;
  }
  const rootPath = new TextDecoder().decode(root.stdout).trim();
  const branch = Bun.spawnSync({
    cmd: ["git", "-C", cwd, "branch", "--show-current"],
  });
  return {
    repo: basename(rootPath),
    worktree: basename(cwd),
    branch: new TextDecoder().decode(branch.stdout).trim() || "Detached",
  };
}

function sessionView(card: IndexCard, now: number): FleetSession {
  return {
    provider: card.host,
    name: card.name,
    ...freshness(card.mtime_ms, now),
  };
}

function sessionRank(freshness: FleetFreshness): number {
  return { live: 0, recent: 1, stale: 2, unknown: 3 }[freshness];
}

export function redactLocalDetail(value: string): string {
  return value
    .replace(
      /\b(?:ghp|github_pat|sk|xox[baprs])-?[A-Za-z0-9_-]{16,}\b/g,
      "[REDACTED]",
    )
    .replace(
      /\b(password|passwd|secret|token|api[_-]?key|authorization)\s*[:=]\s*([^\s,}\]]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g,
      "[REDACTED CERTIFICATE]",
    )
    .replace(
      /\/(?:Users|home)\/[A-Za-z0-9._-]+(?:\/[^\s"'`]+)*/g,
      "[LOCAL PATH]",
    );
}

/** Return explicit project, worktree, and branch labels for agent supervision. */
export function fleetContextLabels(
  agent: Pick<FleetAgentActivity, "project" | "worktree" | "branch">,
): string[] {
  const project = agent.project?.trim();
  const worktree = agent.worktree?.trim();
  const branch = agent.branch?.trim();
  const labels: string[] = [];
  if (project) {
    labels.push(`Project: ${project}`);
  }
  if (worktree) {
    labels.push(`Worktree: ${worktree}`);
  }
  if (branch) {
    labels.push(`Branch: ${branch}`);
  }
  return labels;
}

function sessionDetail(card: IndexCard): {
  latestMessage: string | null;
  recentActivity: string[];
  detailAvailability: "available" | "unavailable";
  contextPath: string | null;
} {
  if (!existsSync(card.path) || !statSync(card.path).isFile()) {
    return {
      latestMessage: null,
      recentActivity: [],
      detailAvailability: "unavailable",
      contextPath: null,
    };
  }
  try {
    return fleetSessionDetail(
      readFileSync(card.path, "utf8").slice(-48_000),
      redactLocalDetail,
    );
  } catch {
    return {
      latestMessage: null,
      recentActivity: [],
      detailAvailability: "unavailable",
      contextPath: null,
    };
  }
}

export function fleetStateForSessions(sessions: FleetSession[]): FleetState {
  if (
    sessions.some(
      (session) =>
        session.freshness === "live" || session.freshness === "recent",
    )
  ) {
    return "recent";
  }
  return "history";
}

function labelCollidingProjects(
  repositories: Map<string, FleetRepository>,
  worktreeDetails: Map<
    string,
    { repo: string; worktree: string; branch: string }
  >,
  worktreeRepoByPath: Map<string, string>,
): void {
  const keysByProject = new Map<string, string[]>();
  for (const [key, repository] of repositories) {
    const keys = keysByProject.get(repository.project) ?? [];
    keys.push(key);
    keysByProject.set(repository.project, keys);
  }
  for (const keys of keysByProject.values()) {
    if (keys.length < 2) {
      continue;
    }
    keys.sort();
    for (const [index, key] of keys.entries()) {
      const repository = repositories.get(key);
      if (repository) {
        repository.project = `${repository.project} · ${index + 1}`;
      }
    }
  }
  for (const [path, details] of worktreeDetails) {
    const key = worktreeRepoByPath.get(path);
    const repository = key ? repositories.get(key) : undefined;
    if (repository) {
      worktreeDetails.set(path, { ...details, repo: repository.project });
    }
  }
}

/** Build a bounded, metadata-only snapshot directly from Let catalog APIs. */
export async function buildFleetSnapshot(
  cwd: string,
  now = Date.now(),
): Promise<FleetSnapshot> {
  // Fleet needs one current record per host. A narrow shared result limit can
  // otherwise hide user-scoped Codex sessions behind project-scoped records.
  // This remains a bounded Let index query, not a new filesystem scan.
  const ctx = buildScanContext({ cwd, scope: "all", limit: 300 });
  const sessionHosts = [
    "claude",
    "codex",
    "grok",
    "cursor",
    "gemini",
    "kimi",
    "let",
  ];
  const [worktrees, sessionResults, instructions, skills] = await Promise.all([
    findAssets("worktrees", ctx),
    Promise.all(
      sessionHosts.map((host) => findAssets("sessions", ctx, { host })),
    ),
    findAssets("instructions", ctx),
    findAssets("skills", ctx),
  ]);
  const sessions = { items: sessionResults.flatMap((result) => result.items) };

  const instructionCards = instructions.items.slice(0, 8).map((item) => ({
    name: item.name,
    provider: item.host,
    scope: item.scope,
  }));
  const skillCards = skills.items.slice(0, 8).map((item) => ({
    name: item.name,
    provider: item.host,
    scope: item.scope,
  }));
  const repositories = new Map<string, FleetRepository>();
  const worktreeRepoByPath = new Map<string, string>();
  const worktreeDetails = new Map<
    string,
    { repo: string; worktree: string; branch: string }
  >();
  for (const worktree of worktrees.items.slice(0, 48)) {
    const key = repositoryPath(worktree);
    worktreeRepoByPath.set(worktree.path, key);
    const repository = repositories.get(key) ?? {
      project: projectName(worktree),
      state: "history" as FleetState,
      activity: "No session heartbeat",
      worktrees: [],
      sessions: [],
      instructions: instructionCards,
      skills: skillCards,
    };
    repository.worktrees.push({
      provider: worktree.host,
      worktree: worktree.name,
      branch: worktree.branch ?? "Detached",
      status: worktree.status ?? "unknown",
    });
    worktreeDetails.set(worktree.path, {
      repo: repository.project,
      worktree: worktree.name,
      branch: worktree.branch ?? "Detached",
    });
    repositories.set(key, repository);
  }

  const unmatchedSessions: FleetSession[] = [];
  for (const session of sessions.items) {
    const key = session.repo_root
      ? repositories.has(session.repo_root)
        ? session.repo_root
        : worktreeRepoByPath.get(session.repo_root)
      : undefined;
    const view = sessionView(session, now);
    if (!key) {
      unmatchedSessions.push(view);
      continue;
    }
    repositories.get(key)?.sessions.push(view);
  }

  labelCollidingProjects(repositories, worktreeDetails, worktreeRepoByPath);

  const agentsByName = new Map<LiveAgent["agent"], FleetAgentActivity>();
  const sessionMtimeByAgent = new Map<LiveAgent["agent"], number>();
  for (const session of sessions.items) {
    const adapter = fleetAdapterFor(session);
    if (!adapter) {
      continue;
    }
    const agent = adapter.provider;
    const key = session.repo_root
      ? repositories.has(session.repo_root)
        ? session.repo_root
        : worktreeRepoByPath.get(session.repo_root)
      : undefined;
    const worktree = session.repo_root
      ? worktreeDetails.get(session.repo_root)
      : undefined;
    const repository = key ? repositories.get(key) : undefined;
    const view = sessionView(session, now);
    const existing = agentsByName.get(agent);
    const candidateMtime = session.mtime_ms ?? 0;
    const existingMtime = sessionMtimeByAgent.get(agent) ?? 0;
    if (
      !existing ||
      sessionRank(view.freshness) <
        sessionRank(existing.status === "recent" ? "recent" : "stale") ||
      (sessionRank(view.freshness) ===
        sessionRank(existing.status === "recent" ? "recent" : "stale") &&
        candidateMtime > existingMtime)
    ) {
      const detail = sessionDetail(session);
      const sessionContext = detail.contextPath
        ? gitLocation(detail.contextPath)
        : null;
      agentsByName.set(agent, {
        agent,
        status:
          view.freshness === "live" || view.freshness === "recent"
            ? "recent"
            : "history",
        operation:
          view.freshness === "stale"
            ? "Previous session activity"
            : "Recent session activity",
        project:
          sessionContext?.repo ?? worktree?.repo ?? repository?.project ?? null,
        worktree: sessionContext?.worktree ?? worktree?.worktree ?? null,
        branch: sessionContext?.branch ?? worktree?.branch ?? null,
        evidence: "Session metadata",
        lastAction: view.activity,
        command: null,
        startedAt: null,
        latestMessage: detail.latestMessage,
        recentActivity: detail.recentActivity,
        detailAvailability: detail.detailAvailability,
      });
      sessionMtimeByAgent.set(agent, candidateMtime);
    }
  }

  const workingNow = readLiveAgents().map((agent) => {
    const match = [...worktreeDetails.entries()].find(
      ([path]) => agent.cwd === path || agent.cwd.startsWith(`${path}/`),
    );
    const details = match?.[1] ?? gitLocation(agent.cwd);
    const working: WorkingAgent = {
      agent: agent.agent,
      repo: details?.repo ?? "Unassigned running agent",
      worktree: details?.worktree ?? null,
      branch: details?.branch ?? null,
      matched: details !== undefined,
      operation: agent.operation,
    };
    const prior = agentsByName.get(agent.agent);
    agentsByName.set(agent.agent, {
      agent: agent.agent,
      status: "working",
      operation:
        agent.agent === "Antigravity" && prior
          ? "Antigravity session activity"
          : (agent.operation ?? "Working in project"),
      project: details?.repo ?? prior?.project ?? null,
      worktree: details?.worktree ?? prior?.worktree ?? null,
      branch: details?.branch ?? prior?.branch ?? null,
      evidence: "Local process",
      lastAction: "Now",
      command: agent.command ? redactLocalDetail(agent.command) : null,
      startedAt: agent.startedAt ?? null,
      latestMessage: prior?.latestMessage ?? null,
      recentActivity: prior?.recentActivity ?? [],
      detailAvailability:
        agent.command || prior?.detailAvailability === "available"
          ? "available"
          : "unavailable",
    });
    return working;
  });
  if (!agentsByName.has("Gemini") && !agentsByName.has("Antigravity")) {
    agentsByName.set("Gemini", {
      agent: "Gemini",
      status: "history",
      operation: "Gemini and Antigravity are unavailable on this machine",
      project: null,
      worktree: null,
      branch: null,
      evidence: "Adapter unavailable",
      lastAction: "Not detected",
      command: null,
      startedAt: null,
      latestMessage: null,
      recentActivity: [],
      detailAvailability: "unavailable",
    });
  }
  const agents = [...agentsByName.values()].sort((left, right) => {
    const order = { working: 0, recent: 1, history: 2 };
    return (
      order[left.status] - order[right.status] ||
      left.agent.localeCompare(right.agent)
    );
  });

  const recentActivity: FleetRepository[] = [];
  const history: FleetRepository[] = [];
  for (const repository of repositories.values()) {
    repository.worktrees.sort((left, right) =>
      left.branch.localeCompare(right.branch),
    );
    repository.sessions.sort((left, right) => {
      const order: Record<FleetFreshness, number> = {
        live: 0,
        recent: 1,
        stale: 2,
        unknown: 3,
      };
      return order[left.freshness] - order[right.freshness];
    });
    const newest = repository.sessions[0];
    repository.state = fleetStateForSessions(repository.sessions);
    if (repository.state === "recent") {
      repository.activity = `Observed session activity ${newest.activity}`;
      recentActivity.push(repository);
    } else {
      repository.activity = newest
        ? `Last session ${newest.activity}`
        : "No session heartbeat";
      history.push(repository);
    }
  }
  for (const group of [recentActivity, history]) {
    group.sort((left, right) => left.project.localeCompare(right.project));
  }
  return {
    source: "let",
    generatedAt: new Date(now).toISOString(),
    refreshSeconds: 20,
    recentActivity,
    history,
    unmatchedSessions: unmatchedSessions
      .sort((left, right) => left.activity.localeCompare(right.activity))
      .slice(0, 12),
    workingNow,
    agents,
    liveProcessDetection: "local-process",
    policy:
      "Read-only local index. Expanded cards show redacted local task context and recent session text when available. No controls are exposed.",
  };
}

export function fleetHtml(): string {
  const supervisor = fleetSupervisorHtml();
  if (supervisor.length > 0) {
    return supervisor;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Let Fleet</title><style>
  :root{--ink:#eaf4f3;--muted:#9aabb1;--ground:#10151a;--panel:#182128;--line:#31404a;--aqua:#59d7cb;--lime:#afe84c}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#17343a 0,transparent 32rem),var(--ground);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px 24px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px}.eyebrow{font:600 11px ui-monospace,monospace;letter-spacing:.13em;color:var(--aqua);text-transform:uppercase}h1{font-size:36px;letter-spacing:-.04em;margin:4px 0}h2{margin:4px 0;font-size:17px}p{color:var(--muted);max-width:660px;margin:0}.stamp{color:var(--muted);font:12px ui-monospace,monospace;text-align:right}.views{display:flex;gap:8px;margin:24px 0 12px}.view{background:transparent;border:1px solid var(--line);border-radius:999px;color:var(--muted);cursor:pointer;padding:8px 12px;font:600 12px ui-monospace,monospace}.view[aria-pressed="true"]{background:var(--aqua);border-color:var(--aqua);color:#102124}.view:focus-visible,.repo-head:focus-visible{outline:3px solid var(--aqua);outline-offset:2px}.section{margin:14px 0 10px;display:flex;align-items:baseline;gap:10px}.section p{font-size:12px}.agent-card,.repo{background:rgba(24,33,40,.9);border:1px solid var(--line);border-radius:10px;margin:10px 0}.agent-card{padding:17px;border-left:3px solid var(--line)}.agent-card.working{border-left-color:var(--lime)}.agent-line{color:var(--ink);font-size:18px;font-weight:650;letter-spacing:-.02em}.agent-meta,.details{margin-top:10px;border-top:1px solid #27353d}.agent-meta,.session{display:flex;justify-content:space-between;gap:14px;padding:9px 0;font:12px ui-monospace,monospace}.agent-meta span:last-child,.session span:last-child{color:var(--muted)}.repo{overflow:hidden}.repo-head{list-style:none;padding:14px 15px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}.repo-head::-webkit-details-marker{display:none}.repo-head:hover{background:#1d3035}.project{font-weight:700}.sub{display:block;color:var(--muted);font:12px ui-monospace,monospace;margin-top:2px}.signal{color:var(--aqua);font:12px ui-monospace,monospace}.details{padding:0 15px}.details summary{padding:11px 0;color:var(--muted);cursor:pointer;font-size:12px}.session{border-top:1px solid #27353d}.empty{color:var(--muted);font-size:13px;padding:13px 0}.notice{margin-top:22px;color:var(--muted);font-size:12px}@media(max-width:740px){main{padding:22px 12px}header{display:block}.stamp{text-align:left;margin-top:12px}h1{font-size:30px}.agent-meta,.session{display:block}.agent-meta span,.session span{display:block;margin:3px 0}}@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important;transition:none!important}}</style></head><body><main><header><div><div class="eyebrow">Let / local observatory</div><h1>Fleet activity</h1><p>Who is working, where they are working, and what changed most recently.</p></div><div class="stamp" id="stamp">Loading…</div></header><nav class="views" aria-label="Fleet view"><button class="view" type="button" data-view="agents" aria-pressed="true">By agent</button><button class="view" type="button" data-view="projects" aria-pressed="false">By project</button></nav><div id="app"></div><p class="notice" id="notice"></p></main><script>
  let fleet={agents:[],recentActivity:[],history:[]},view='agents';const e=s=>{const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML};const human=s=>String(s??'').replace(/[-_]+/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());const plural=(n,word)=>n+' '+word+(n===1?'':'s');const work=w=>'<div class="session"><span>Worktree · '+e(w.worktree)+'</span><span>Branch · '+e(w.branch)+'</span></div>';const project=r=>'<details class="repo"><summary class="repo-head"><span><span class="project">'+e(human(r.project))+'</span><span class="sub">'+plural(r.worktrees.length,'worktree')+'</span></span>'+ (r.state==='recent'?'<span class="signal">Recent activity</span>':'')+'</summary><div class="details">'+r.worktrees.map(work).join('')+'<details><summary>Recent history ('+r.sessions.length+')</summary>'+(r.sessions.length?r.sessions.map(s=>'<div class="session"><span>'+e(s.provider)+' session</span><span>'+e(s.activity)+'</span></div>').join(''):'<div class="empty">No recent history.</div>')+'</details></div></details>';const agent=a=>{const project=a.project?human(a.project):'Unassigned running agent';const worktree=a.worktree&&human(a.worktree)!==project?'<span>Worktree · '+e(a.worktree)+'</span>':'';const branch=a.branch?'<span>Branch · '+e(a.branch)+'</span>':'';const status=a.status==='working'?'Working now':a.status==='recent'?'Recent session':'Earlier session';return '<article class="agent-card '+e(a.status)+'"><p class="agent-line">'+e(a.agent)+' — '+e(a.operation)+'</p><div class="agent-meta"><span>Project · '+e(project)+'</span><span>'+e(status)+'</span></div><div class="agent-meta">'+worktree+branch+'<span>Last meaningful action · '+e(a.lastAction)+'</span></div></article>'};const section=(title,copy,rows,render)=>'<section><div class="section"><h2>'+title+' ('+rows.length+')</h2><p>'+copy+'</p></div>'+(rows.length?rows.map(render).join(''):'<p class="empty">None.</p>')+'</section>';function render(){const projects=[...fleet.recentActivity,...fleet.history];document.querySelector('#stamp').textContent=plural(fleet.agents.filter(a=>a.status==='working').length,'agent')+' working · '+plural(projects.length,'project');document.querySelector('#notice').textContent=fleet.policy;document.querySelector('#app').innerHTML=view==='agents'?section('By agent','Process-backed work is marked Working now. Session records stay clearly separate.',fleet.agents,agent):section('By project','Open a project to see worktrees and recent history.',projects,project);document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.view===view)));render()}))}async function refresh(){fleet=await fetch('/api/fleet').then(r=>r.json());render()}refresh();setInterval(refresh,5000);</script></body></html>`;
}

function fleetSupervisorHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>Let Fleet</title><script>try{const t=new URLSearchParams(location.search).get('theme')||localStorage.getItem('corvid-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}</script><link rel="stylesheet" href="/assets/tokens.css"><script defer src="/assets/theme.js"></script><style>
  *{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.5 var(--font-display)}main{max-width:1080px;margin:auto;padding:30px 24px}.masthead{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:start;padding-bottom:20px;border-bottom:1px solid var(--hairline);position:relative}.masthead:after{content:'';position:absolute;height:4px;left:0;right:0;bottom:-1px;background:var(--iridescence)}h1{margin:4px 0;font-size:clamp(2.1rem,5vw,4rem);line-height:.95;letter-spacing:-.055em}.eyebrow,.meta,.status,.row span:first-child{font:12px/1.4 var(--font-mono);letter-spacing:.04em}.eyebrow{text-transform:uppercase;color:var(--sheen-strong)}.meta{color:var(--text-faint)}.local{margin:20px 0;padding:12px 14px;border:1px solid var(--hairline);border-left:4px solid var(--sheen);background:var(--surface)}.header-actions{display:flex;gap:9px;align-items:center}.corvid-theme-toggle{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;padding:0;background:none;border:1px solid var(--hairline);color:var(--ink-70);cursor:pointer}.corvid-theme-toggle:hover{border-color:var(--sheen);color:var(--sheen)}.corvid-theme-toggle:focus-visible,.view:focus-visible,summary:focus-visible{outline:2px solid var(--sheen);outline-offset:3px}.corvid-theme-toggle svg{width:17px;height:17px}.moon{display:none}:root[data-theme="dark"] .sun{display:none}:root[data-theme="dark"] .moon{display:inline}@media(prefers-color-scheme:dark){:root:not([data-theme="light"]) .sun{display:none}:root:not([data-theme="light"]) .moon{display:inline}}:root[data-theme="light"] .sun{display:inline}:root[data-theme="light"] .moon{display:none}.views{display:flex;gap:4px;margin:22px 0 14px;border-bottom:1px solid var(--hairline)}.view{border:0;border-bottom:2px solid transparent;padding:10px 12px;background:transparent;color:var(--text-faint);font:600 12px var(--font-mono);cursor:pointer}.view[aria-pressed="true"]{color:var(--sheen-strong);border-color:var(--sheen)}.card{border:1px solid var(--hairline);background:var(--surface);margin:9px 0;padding:16px}.card.working{border-left:4px solid var(--success)}.line{font-size:19px;font-weight:700;letter-spacing:-.025em}.row{display:flex;justify-content:space-between;gap:18px;padding:9px 0;border-top:1px solid var(--hairline)}.row span:last-child{color:var(--text-muted);text-align:right}.row.activity span:last-child{max-width:68%;text-align:left}details summary{cursor:pointer;color:var(--sheen-strong);padding:11px 0;font-weight:600}.output{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink-70);background:var(--surface-strong);padding:12px;font:12px/1.5 var(--font-mono)}.notice{color:var(--text-faint);font-size:12px;margin-top:24px}@media(max-width:740px){main{padding:20px 14px}.masthead{grid-template-columns:1fr}.row{display:block}.row span{display:block;margin:3px 0}.row span:last-child{text-align:left}.row.activity span:last-child{max-width:none}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}</style></head><body><main><header class="masthead"><div><div class="eyebrow">Let Fleet / local control room</div><h1>Supervise local agents.</h1><p class="meta">A read-only view built from Let’s own federated index.</p></div><div class="header-actions"><div class="meta" id="stamp">Loading…</div><button type="button" class="corvid-theme-toggle" data-corvid-theme-toggle aria-pressed="false" aria-label="Switch to dark theme" title="Switch theme"><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.4M12 19v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2.6 12h2.4M19 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A8.6 8.6 0 1 1 11.2 3a6.7 6.7 0 0 0 9.8 9.8z"/></svg></button></div></header><aside class="local"><strong>Local only.</strong> Fleet never sends your agent or session data away. Details are redacted before display.</aside><nav class="views" aria-label="Fleet view"><button class="view" data-view="agents" aria-pressed="true">Agents</button><button class="view" data-view="projects" aria-pressed="false">Projects</button></nav><div id="app"></div><p class="notice" id="notice"></p></main><script>
  let fleet={agents:[],recentActivity:[],history:[]},view='agents';const e=s=>{const d=document.createElement('div');d.textContent=String(s??'Unavailable');return d.innerHTML};const human=s=>String(s||'Unassigned running agent').replace(/[-_]+/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());const plural=(n,w)=>n+' '+w+(n===1?'':'s');const preview=s=>String(s||'Waiting for a local session update').replace(/\\s+/g,' ').slice(0,220);const context=a=>{const labels=[a.project?'<span>Project · '+e(human(a.project))+'</span>':'',a.worktree?'<span>Worktree · '+e(a.worktree)+'</span>':'',a.branch?'<span>Branch · '+e(a.branch)+'</span>':''].filter(Boolean);return labels.join('')||'<span>Project context not available yet</span>'};const agent=a=>{const contextText=[a.project,a.worktree,a.branch].filter(Boolean).join(' · ');const details='<details><summary>Show supervision details</summary><div class="row"><span>Task</span><span>'+e(a.operation)+'</span></div><div class="row"><span>Context</span><span>'+e(contextText||'Project context not available yet')+'</span></div><div class="row"><span>Current command</span><span>'+e(a.command||'Unavailable')+'</span></div><div class="row"><span>Started</span><span>'+e(a.startedAt||'Unavailable')+'</span></div><div class="row"><span>Latest prompt or update</span><span>'+e(a.latestMessage||'Unavailable')+'</span></div><div class="row"><span>Detail source</span><span>'+e(a.evidence)+' · '+e(a.detailAvailability)+'</span></div>'+(a.recentActivity.length?'<div><p class="meta">Recent output</p><div class="output">'+a.recentActivity.map(e).join('\\n\\n')+'</div></div>':'<p class="meta">Recent output unavailable.</p>')+'</details>';return '<article class="card '+e(a.status)+'"><div class="line">'+e(a.agent)+' · '+e(a.status==='working'?'Working now':a.status==='recent'?'Recent activity':'Earlier activity')+'</div><div class="row"><span>Task · '+e(a.operation)+'</span><span>Last update · '+e(a.lastAction)+'</span></div><div class="row">'+context(a)+'</div><div class="row activity"><span>Latest prompt or update</span><span>'+e(preview(a.latestMessage))+'</span></div>'+details+'</article>'};const project=r=>'<details class="card"><summary><strong>'+e(human(r.project))+'</strong> · '+e(plural(r.worktrees.length,'worktree'))+'</summary>'+r.worktrees.map(w=>'<div class="row"><span>'+e(w.worktree)+'</span><span>'+e(w.branch)+'</span></div>').join('')+'</details>';function render(){const projects=[...fleet.recentActivity,...fleet.history];document.querySelector('#stamp').textContent=plural(fleet.agents.filter(a=>a.status==='working').length,'agent')+' working · '+plural(projects.length,'project');document.querySelector('#notice').textContent=fleet.policy;document.querySelector('#app').innerHTML=view==='agents'?fleet.agents.map(agent).join('')||'<p class="meta">No local agent or session metadata is available.</p>':projects.map(project).join('')||'<p class="meta">No projects are available.</p>';document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>{view=button.dataset.view;document.querySelectorAll('[data-view]').forEach(item=>item.setAttribute('aria-pressed',String(item.dataset.view===view)));render()}))}async function refresh(){fleet=await fetch('/api/fleet').then(r=>r.json());render()}refresh();setInterval(refresh,5000);</script></body></html>`;
}

function _previousFleetHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Let Fleet</title><style>
  :root{--ink:#eaf4f3;--muted:#9aabb1;--ground:#10151a;--panel:#182128;--line:#31404a;--aqua:#59d7cb;--lime:#afe84c}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#17343a 0,transparent 32rem),var(--ground);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}main{max-width:960px;margin:auto;padding:32px 24px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px}.eyebrow{font:600 11px ui-monospace,monospace;letter-spacing:.13em;color:var(--aqua);text-transform:uppercase}h1{font-size:36px;letter-spacing:-.04em;margin:4px 0}h2{margin:4px 0;font-size:17px}p{color:var(--muted);max-width:660px;margin:0}.stamp{color:var(--muted);font:12px ui-monospace,monospace;text-align:right}.section{margin:28px 0 10px;display:flex;align-items:baseline;gap:10px}.section p{font-size:12px}.working-card,.repo{background:rgba(24,33,40,.9);border:1px solid var(--line);border-radius:10px;margin:10px 0}.working-card{padding:18px;border-left:3px solid var(--lime)}.working-sentence{color:var(--ink);font-size:18px;font-weight:650;letter-spacing:-.02em}.live-meta,.details{margin-top:10px;border-top:1px solid #27353d}.live-meta,.session{display:flex;justify-content:space-between;gap:14px;padding:9px 0;font:12px ui-monospace,monospace}.live-meta span:last-child,.session span:last-child{color:var(--muted)}.repo{overflow:hidden}.repo-head{list-style:none;padding:14px 15px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}.repo-head::-webkit-details-marker{display:none}.repo-head:hover{background:#1d3035}.repo-head:focus-visible{outline:3px solid var(--aqua);outline-offset:-3px}.project{font-weight:700}.sub{display:block;color:var(--muted);font:12px ui-monospace,monospace;margin-top:2px}.signal{color:var(--aqua);font:12px ui-monospace,monospace}.details{padding:0 15px}.details summary{padding:11px 0;color:var(--muted);cursor:pointer;font-size:12px}.session{border-top:1px solid #27353d}.empty{color:var(--muted);font-size:13px;padding:13px 0}.notice{margin-top:22px;color:var(--muted);font-size:12px}@media(max-width:740px){main{padding:22px 12px}header{display:block}.stamp{text-align:left;margin-top:12px}h1{font-size:30px}.live-meta,.session{display:block}.live-meta span,.session span{display:block;margin:3px 0}}@media(prefers-reduced-motion:reduce){*{animation:none!important;scroll-behavior:auto!important;transition:none!important}}</style></head><body><main><header><div><div class="eyebrow">Let / local observatory</div><h1>Fleet activity</h1><p>See who is working first, then open a project only when you need its worktrees and history.</p></div><div class="stamp" id="stamp">Loading…</div></header><div id="app"></div><p class="notice" id="notice"></p></main><script>
  let fleet={workingNow:[],recentActivity:[],history:[]};const e=s=>{const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML};const human=s=>String(s??'').replace(/[-_]+/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());const plural=(n,word)=>n+' '+word+(n===1?'':'s');const work=w=>'<div class="session"><span>Worktree · '+e(w.worktree)+'</span><span>Branch · '+e(w.branch)+'</span></div>';const signal=r=>r.state==='recent'?'<span class="signal">Recent activity</span>':'';const card=r=>'<details class="repo"><summary class="repo-head"><span><span class="project">'+e(human(r.project))+'</span><span class="sub">'+plural(r.worktrees.length,'worktree')+'</span></span>'+signal(r)+'</summary><div class="details">'+r.worktrees.map(work).join('')+'<details><summary>Recent history ('+r.sessions.length+')</summary>'+(r.sessions.length?r.sessions.map(s=>'<div class="session"><span>'+e(s.provider)+' session</span><span>'+e(s.activity)+'</span></div>').join(''):'<div class="empty">No recent history.</div>')+'</details></div></details>';const section=(title,copy,rows,renderer=card)=>'<section><div class="section"><h2>'+title+' ('+rows.length+')</h2><p>'+copy+'</p></div>'+(rows.length?rows.map(renderer).join(''):'<p class="empty">None.</p>')+'</section>';const live=a=>'<article class="working-card"><p class="working-sentence">'+e(a.agent)+' is working on '+e(a.matched?human(a.repo):'an unassigned project')+'</p>'+ (a.matched?'<div class="live-meta"><span>Worktree · '+e(a.worktree)+'</span><span>Branch · '+e(a.branch)+'</span></div>':'<div class="live-meta"><span>Unassigned running agent</span></div>')+'</article>';function render(){const projects=[...fleet.recentActivity,...fleet.history];document.querySelector('#stamp').textContent=plural(fleet.workingNow.length,'agent')+' working · '+plural(projects.length,'project');document.querySelector('#notice').textContent=fleet.policy;document.querySelector('#app').innerHTML=section('Working now','Live local agent processes only.',fleet.workingNow,live)+section('Projects','Open a project to see its worktrees and recent history.',projects)+section('Recent history','Observed session metadata, never a live-process claim.',fleet.recentActivity)+section('History','Older session records.',fleet.history)}async function refresh(){fleet=await fetch('/api/fleet').then(r=>r.json());render()}refresh();setInterval(refresh,5000);</script></body></html>`;
}

function _legacyFleetHtml(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Let Fleet</title><style>
  :root{--bg:#10151a;--panel:#182128;--line:#31404a;--text:#edf5f5;--muted:#9aabb1;--aqua:#59d7cb;--lime:#afe84c;--yellow:#f1c967}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#17343a 0,transparent 32rem),var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:32px 24px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:18px}.eyebrow{font:600 11px ui-monospace,monospace;letter-spacing:.13em;color:var(--aqua);text-transform:uppercase}h1{font-size:36px;letter-spacing:-.04em;margin:4px 0}h2{margin:4px 0;font-size:20px}p{color:var(--muted);max-width:660px;margin:0}.stamp{color:var(--muted);font:12px ui-monospace,monospace;text-align:right}.section{margin:26px 0 10px;display:flex;align-items:baseline;gap:10px}.section h2{font-size:15px;letter-spacing:.02em}.section p{font-size:12px}.repo{background:rgba(24,33,40,.9);border:1px solid var(--line);border-radius:10px;margin:10px 0;overflow:hidden}.repo-head{width:100%;padding:15px;background:transparent;border:0;color:var(--text);display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer}.repo-head:hover{background:#1d3035}.project{font-weight:700}.sub{display:block;color:var(--muted);font:12px ui-monospace,monospace;margin-top:2px}.dot{display:inline-flex;gap:7px;align-items:center;color:var(--muted);font:12px ui-monospace,monospace}.dot:before{content:'';width:8px;height:8px;border-radius:50%;background:var(--muted)}.dot.active:before{background:var(--aqua);box-shadow:0 0 0 4px #59d7cb20}.dot.recent:before{background:var(--lime)}.dot.history:before{background:var(--yellow)}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 15px;color:var(--muted);font:600 10px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}td{padding:10px 15px;border-top:1px solid #27353d;font-size:13px}.worktree{font-family:ui-monospace,monospace}.details{border-top:1px solid #27353d;padding:0 15px}.details summary{padding:11px 0;color:var(--muted);cursor:pointer;font-size:12px}.session{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-top:1px solid #27353d;font:12px ui-monospace,monospace}.session span:last-child{color:var(--muted)}.empty{color:var(--muted);font-size:13px;padding:13px 0}.notice{margin-top:22px;color:var(--muted);font-size:12px}@media(max-width:740px){main{padding:22px 12px}header{display:block}.stamp{text-align:left;margin-top:12px}th:nth-child(1),td:nth-child(1){display:none}h1{font-size:30px}}</style></head><body><main><header><div><div class="eyebrow">Let / local observatory</div><h1>Fleet activity</h1><p>Repositories first. Worktrees and branches are the primary unit; session metadata is secondary evidence, never a claim that stale history is live work.</p></div><div class="stamp" id="stamp">Loading…</div></header><div id="app"></div><p class="notice" id="notice"></p></main><script>
  let fleet={workingNow:[],recentActivity:[],history:[]};const e=s=>{const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML};const work=w=>'<div class="session"><span>Worktree · '+e(w.worktree)+'</span><span>Branch · '+e(w.branch)+'</span></div>';const card=r=>'<article class="repo"><div class="repo-head"><span><span class="project">'+e(r.project)+'</span><span class="sub">'+r.worktrees.length+' worktree'+(r.worktrees.length===1?'':'s')+'</span></span><span class="dot '+e(r.state)+'">'+e(r.activity)+'</span></div><div class="details">'+r.worktrees.map(work).join('')+'<details><summary>Recent history ('+r.sessions.length+')</summary>'+(r.sessions.length?r.sessions.map(s=>'<div class="session"><span>'+e(s.provider)+' session</span><span>'+e(s.activity)+'</span></div>').join(''):'<div class="empty">No session history found.</div>')+'</details></div></article>';const section=(title,copy,rows,renderer=card)=>'<section><div class="section"><h2>'+title+' ('+rows.length+')</h2><p>'+copy+'</p></div>'+(rows.length?rows.map(renderer).join(''):'<p class="empty">None.</p>')+'</section>';const live=a=>'<article class="repo"><div class="repo-head"><span><span class="project">'+e(a.agent)+'</span><span class="sub">'+e(a.repo)+'</span></span><span class="dot recent">Running locally</span></div><div class="details">'+(a.matched?'<div class="session"><span>Worktree · '+e(a.worktree)+'</span><span>Branch · '+e(a.branch)+'</span></div>':'<div class="session"><span>Unassigned running agent</span></div>')+'</div></article>';function render(){const projects=[...fleet.recentActivity,...fleet.history];document.querySelector('#stamp').textContent=fleet.workingNow.length+' running agents · '+projects.length+' repositories';document.querySelector('#notice').textContent=fleet.policy;document.querySelector('#app').innerHTML=section('Working now','Live local agent processes only.',fleet.workingNow,live)+section('Projects','Repositories and their worktrees.',projects)+section('Recent history','Observed session metadata, never a live-process claim.',fleet.recentActivity)+section('History','Older session records.',fleet.history)}async function refresh(){fleet=await fetch('/api/fleet').then(r=>r.json());render()}refresh();setInterval(refresh,5000);</script></body></html>`;
}

export function startFleetWeb(options: { cwd: string; port?: number }): {
  url: string;
  stop: () => void;
} {
  const port = options.port ?? 8731;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: async (request) => {
      const pathname = new URL(request.url).pathname;
      if (pathname === "/api/fleet") {
        return Response.json(await buildFleetSnapshot(options.cwd));
      }
      if (pathname === "/assets/tokens.css") {
        return new Response(CORVID_TOKENS_CSS, {
          headers: { "content-type": "text/css; charset=utf-8" },
        });
      }
      if (pathname === "/assets/theme.js") {
        return new Response(CORVID_THEME_JS, {
          headers: { "content-type": "text/javascript; charset=utf-8" },
        });
      }
      if (pathname === "/" || pathname === "/index.html") {
        return new Response(fleetHtml(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop() };
}
