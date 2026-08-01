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
  liveProcessDetection: "unavailable";
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
  const root = card.repo_root;
  return root ? basename(root) : card.name;
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
  for (const worktree of worktrees.items.slice(0, 48)) {
    const key = worktree.repo_root ?? worktree.path;
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
    liveProcessDetection: "unavailable",
    policy:
      "Read-only local index. No session transcripts, paths, secrets, terminal output, or agent controls are exposed.",
  };
}

function html(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Let Fleet</title><style>
  :root{--bg:#10151a;--panel:#182128;--line:#31404a;--text:#edf5f5;--muted:#9aabb1;--aqua:#59d7cb;--lime:#afe84c;--yellow:#f1c967}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#17343a 0,transparent 32rem),var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:32px 24px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:18px}.eyebrow{font:600 11px ui-monospace,monospace;letter-spacing:.13em;color:var(--aqua);text-transform:uppercase}h1{font-size:36px;letter-spacing:-.04em;margin:4px 0}h2{margin:4px 0;font-size:20px}p{color:var(--muted);max-width:660px;margin:0}.stamp{color:var(--muted);font:12px ui-monospace,monospace;text-align:right}.section{margin:26px 0 10px;display:flex;align-items:baseline;gap:10px}.section h2{font-size:15px;letter-spacing:.02em}.section p{font-size:12px}.repo{background:rgba(24,33,40,.9);border:1px solid var(--line);border-radius:10px;margin:10px 0;overflow:hidden}.repo-head{width:100%;padding:15px;background:transparent;border:0;color:var(--text);display:flex;justify-content:space-between;align-items:center;text-align:left;cursor:pointer}.repo-head:hover{background:#1d3035}.project{font-weight:700}.sub{display:block;color:var(--muted);font:12px ui-monospace,monospace;margin-top:2px}.dot{display:inline-flex;gap:7px;align-items:center;color:var(--muted);font:12px ui-monospace,monospace}.dot:before{content:'';width:8px;height:8px;border-radius:50%;background:var(--muted)}.dot.active:before{background:var(--aqua);box-shadow:0 0 0 4px #59d7cb20}.dot.recent:before{background:var(--lime)}.dot.history:before{background:var(--yellow)}table{width:100%;border-collapse:collapse}th{text-align:left;padding:8px 15px;color:var(--muted);font:600 10px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}td{padding:10px 15px;border-top:1px solid #27353d;font-size:13px}.worktree{font-family:ui-monospace,monospace}.details{border-top:1px solid #27353d;padding:0 15px}.details summary{padding:11px 0;color:var(--muted);cursor:pointer;font-size:12px}.session{display:flex;justify-content:space-between;gap:14px;padding:7px 0;border-top:1px solid #27353d;font:12px ui-monospace,monospace}.session span:last-child{color:var(--muted)}.empty{color:var(--muted);font-size:13px;padding:13px 0}.notice{margin-top:22px;color:var(--muted);font-size:12px}@media(max-width:740px){main{padding:22px 12px}header{display:block}.stamp{text-align:left;margin-top:12px}th:nth-child(1),td:nth-child(1){display:none}h1{font-size:30px}}</style></head><body><main><header><div><div class="eyebrow">Let / local observatory</div><h1>Fleet activity</h1><p>Repositories first. Worktrees and branches are the primary unit; session metadata is secondary evidence, never a claim that stale history is live work.</p></div><div class="stamp" id="stamp">Loading…</div></header><div id="app"></div><p class="notice" id="notice"></p></main><script>
  let fleet={recentActivity:[],history:[],liveProcessDetection:'unavailable'};const e=s=>{const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML};const card=(r)=>'<article class="repo"><button class="repo-head" onclick="this.closest(&quot;article&quot;).querySelector(&quot;details&quot;).open=!this.closest(&quot;article&quot;).querySelector(&quot;details&quot;).open"><span><span class="project">'+e(r.project)+'</span><span class="sub">'+r.worktrees.length+' worktree'+(r.worktrees.length===1?'':'s')+'</span></span><span class="dot '+e(r.state)+'">'+e(r.activity)+'</span></button><table><thead><tr><th>Provider</th><th>Worktree</th><th>Branch</th><th>State</th></tr></thead><tbody>'+r.worktrees.map(w=>'<tr><td>'+e(w.provider)+'</td><td class="worktree">'+e(w.worktree)+'</td><td class="worktree">'+e(w.branch)+'</td><td>'+e(w.status)+'</td></tr>').join('')+'</tbody></table><div class="details"><details><summary>Sessions ('+r.sessions.length+') - secondary activity evidence</summary>'+(r.sessions.length?r.sessions.map(s=>'<div class="session"><span>'+e(s.provider)+' · '+e(s.name)+'</span><span>'+e(s.activity)+'</span></div>').join(''):'<div class="empty">No session heartbeat was discovered for this repository.</div>')+'</details></div></article>';const section=(title,copy,rows)=>'<section><div class="section"><h2>'+title+' ('+rows.length+')</h2><p>'+copy+'</p></div>'+(rows.length?rows.map(card).join(''):'<p class="empty">None.</p>')+'</section>';function render(){const count=fleet.recentActivity.length+fleet.history.length;document.querySelector('#stamp').textContent=count+' repositories · updates every '+fleet.refreshSeconds+'s';document.querySelector('#notice').textContent=fleet.policy+' Live process detection: '+fleet.liveProcessDetection+'.';document.querySelector('#app').innerHTML=section('Recent activity','Observed session metadata from the last hour. This is not a live-process claim.',fleet.recentActivity)+section('History','Older session records or repositories without a current heartbeat.',fleet.history)}async function refresh(){fleet=await fetch('/api/fleet').then(r=>r.json());render()}refresh();setInterval(refresh,20000);</script></body></html>`;
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
        return new Response(html(), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("Not found", { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop() };
}
