/**
 * Local-only read-only web view for Let's federated discovery index.
 * It intentionally uses index cards only: no session bodies, terminal output,
 * filesystem paths, shell endpoints, or agent-control actions are exposed.
 */

import { basename } from "node:path";
import { buildScanContext } from "./catalog/context-builder.ts";
import { findAssets } from "./catalog/find.ts";
import type { IndexCard } from "./catalog/types.ts";

export type FleetFreshness = "live" | "recent" | "stale" | "unknown";
export type FleetState = "recent" | "history";

export type FleetSession = {
  provider: string;
  name: string;
  freshness: FleetFreshness;
  activity: string;
};

export type LiveAgent = {
  agent: "Grok" | "Claude" | "Codex" | "Cursor";
  cwd: string;
};

export type WorkingAgent = Omit<LiveAgent, "cwd"> & {
  repo: string;
  worktree: string | null;
  branch: string | null;
  matched: boolean;
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

function readLiveAgents(): LiveAgent[] {
  const processList = Bun.spawnSync({ cmd: ["ps", "-axo", "pid=,comm="] });
  if (processList.exitCode !== 0) {
    return [];
  }
  return parseLocalAgentProcessLines(
    new TextDecoder().decode(processList.stdout),
    (pid) => {
      const cwd = Bun.spawnSync({
        cmd: ["lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"],
      });
      const line = new TextDecoder()
        .decode(cwd.stdout)
        .split("\n")
        .find((item) => item.startsWith("n"));
      return line ? line.slice(1) : null;
    },
    (cwd) =>
      Bun.spawnSync({
        cmd: ["git", "-C", cwd, "rev-parse", "--is-inside-work-tree"],
      }).exitCode === 0,
  );
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

/** Build a bounded, metadata-only snapshot directly from Let catalog APIs. */
export async function buildFleetSnapshot(
  cwd: string,
  now = Date.now(),
): Promise<FleetSnapshot> {
  const ctx = buildScanContext({ cwd, scope: "all", limit: 48 });
  const [worktrees, sessions, instructions, skills] = await Promise.all([
    findAssets("worktrees", ctx),
    findAssets("sessions", ctx),
    findAssets("instructions", ctx),
    findAssets("skills", ctx),
  ]);

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

  const workingNow = readLiveAgents().map((agent) => {
    const match = [...worktreeDetails.entries()].find(
      ([path]) => agent.cwd === path || agent.cwd.startsWith(`${path}/`),
    );
    const details = match?.[1] ?? gitLocation(agent.cwd);
    return {
      agent: agent.agent,
      repo: details?.repo ?? "Unassigned running agent",
      worktree: details?.worktree ?? null,
      branch: details?.branch ?? null,
      matched: details !== undefined,
    } satisfies WorkingAgent;
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
    liveProcessDetection: "local-process",
    policy:
      "Read-only local index. No session transcripts, paths, secrets, terminal output, or agent controls are exposed.",
  };
}

export function fleetHtml(): string {
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
