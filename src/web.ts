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

export type FleetSession = {
  provider: string;
  name: string;
  freshness: FleetFreshness;
  activity: string;
};

export type FleetRow = {
  provider: string;
  project: string;
  worktree: string;
  branch: string;
  status: string;
  freshness: FleetFreshness;
  activity: string;
  sessions: FleetSession[];
  instructions: Array<{ name: string; provider: string; scope: string }>;
  skills: Array<{ name: string; provider: string; scope: string }>;
};

export type FleetSnapshot = {
  source: "let";
  generatedAt: string;
  refreshSeconds: number;
  rows: FleetRow[];
  sessionOnly: FleetSession[];
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

  const sessionsByRoot = new Map<string, IndexCard[]>();
  for (const session of sessions.items) {
    if (!session.repo_root) {
      continue;
    }
    const matching = sessionsByRoot.get(session.repo_root) ?? [];
    matching.push(session);
    sessionsByRoot.set(session.repo_root, matching);
  }

  const rows = worktrees.items.slice(0, 48).map((worktree) => {
    const matchingSessions = [
      ...(sessionsByRoot.get(worktree.path) ?? []),
      ...(worktree.repo_root
        ? (sessionsByRoot.get(worktree.repo_root) ?? [])
        : []),
    ]
      .filter(
        (session, index, all) =>
          all.findIndex((item) => item.id === session.id) === index,
      )
      .sort((left, right) => (right.mtime_ms ?? 0) - (left.mtime_ms ?? 0))
      .slice(0, 3)
      .map((session) => sessionView(session, now));
    const activitySource = matchingSessions[0]?.activity
      ? matchingSessions[0]
      : freshness(worktree.mtime_ms, now);
    return {
      provider: worktree.host,
      project: projectName(worktree),
      worktree: worktree.name,
      branch: worktree.branch ?? "Detached",
      status: worktree.status ?? "unknown",
      freshness: activitySource.freshness,
      activity: activitySource.activity,
      sessions: matchingSessions,
      instructions: instructions.items.slice(0, 8).map((item) => ({
        name: item.name,
        provider: item.host,
        scope: item.scope,
      })),
      skills: skills.items.slice(0, 8).map((item) => ({
        name: item.name,
        provider: item.host,
        scope: item.scope,
      })),
    } satisfies FleetRow;
  });

  const attachedSessionIds = new Set(
    rows.flatMap((row) =>
      row.sessions.map((session) => `${session.provider}:${session.name}`),
    ),
  );
  const sessionOnly = sessions.items
    .sort((left, right) => (right.mtime_ms ?? 0) - (left.mtime_ms ?? 0))
    .map((session) => sessionView(session, now))
    .filter(
      (session) =>
        !attachedSessionIds.has(`${session.provider}:${session.name}`),
    )
    .slice(0, 12);

  rows.sort((left, right) => {
    const order: Record<FleetFreshness, number> = {
      live: 0,
      recent: 1,
      stale: 2,
      unknown: 3,
    };
    return (
      order[left.freshness] - order[right.freshness] ||
      left.project.localeCompare(right.project)
    );
  });
  return {
    source: "let",
    generatedAt: new Date(now).toISOString(),
    refreshSeconds: 20,
    rows,
    sessionOnly,
    policy:
      "Read-only local index. No session transcripts, paths, secrets, terminal output, or agent controls are exposed.",
  };
}

function html(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Let Fleet</title><style>
  :root{--bg:#10151a;--panel:#182128;--line:#31404a;--text:#edf5f5;--muted:#9aabb1;--aqua:#59d7cb;--lime:#afe84c;--yellow:#f1c967}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at top right,#17343a 0,transparent 32rem),var(--bg);color:var(--text);font:14px/1.45 ui-sans-serif,system-ui,sans-serif}main{max-width:1280px;margin:auto;padding:32px 24px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);padding-bottom:22px;margin-bottom:18px}.eyebrow{font:600 11px ui-monospace,monospace;letter-spacing:.13em;color:var(--aqua);text-transform:uppercase}h1{font-size:36px;letter-spacing:-.04em;margin:4px 0}p{color:var(--muted);max-width:620px;margin:0}.stamp{color:var(--muted);font:12px ui-monospace,monospace;text-align:right}.panel{background:rgba(24,33,40,.9);border:1px solid var(--line);border-radius:10px;overflow:hidden}table{width:100%;border-collapse:collapse}th{text-align:left;padding:11px 14px;color:var(--muted);font:600 11px ui-monospace,monospace;letter-spacing:.1em;text-transform:uppercase}td{padding:14px;border-top:1px solid #27353d;vertical-align:middle}tr[data-row]{cursor:pointer}tr[data-row]:hover{background:#1d3035}.project{font-weight:700}.sub{display:block;color:var(--muted);font:12px ui-monospace,monospace;margin-top:2px}.dot{display:inline-flex;gap:7px;align-items:center}.dot:before{content:'';width:8px;height:8px;border-radius:50%;background:var(--muted)}.dot.live:before{background:var(--aqua);box-shadow:0 0 0 4px #59d7cb20}.dot.recent:before{background:var(--lime)}.dot.stale:before{background:var(--yellow)}aside{position:fixed;top:0;right:0;width:min(460px,94vw);height:100%;padding:26px;background:#152028;border-left:1px solid var(--line);transform:translateX(100%);transition:transform .2s;overflow:auto;box-shadow:-16px 0 48px #0004}aside.open{transform:none}.close{float:right;background:none;color:var(--text);border:1px solid var(--line);border-radius:5px;padding:5px 9px;cursor:pointer}.detail{border-top:1px solid var(--line);padding:14px 0}.detail h3{font:600 11px ui-monospace,monospace;letter-spacing:.1em;color:var(--muted);text-transform:uppercase}.item{display:flex;justify-content:space-between;gap:20px;padding:5px 0}.item span:last-child{font:12px ui-monospace,monospace;color:var(--muted);text-align:right}.notice{margin-top:12px;color:var(--muted);font-size:12px}@media(max-width:740px){main{padding:22px 12px}header{display:block}.stamp{text-align:left;margin-top:12px}th:nth-child(3),td:nth-child(3){display:none}h1{font-size:30px}}</style></head><body><main><header><div><div class="eyebrow">Let / local observatory</div><h1>Fleet activity</h1><p>Worktrees and agent sessions discovered from Let's native index. Select a row for bounded context.</p></div><div class="stamp" id="stamp">Loading…</div></header><section class="panel"><table><thead><tr><th>Work</th><th>Provider</th><th>Branch</th><th>Activity</th></tr></thead><tbody id="rows"></tbody></table></section><p class="notice" id="notice"></p></main><aside id="drawer" aria-hidden="true"><button class="close" id="close">Close</button><div id="details"></div></aside><script>
  let fleet={rows:[]};const e=s=>{const d=document.createElement('div');d.textContent=String(s??'');return d.innerHTML};const item=(a,b)=>'<div class="item"><span>'+e(a)+'</span><span>'+e(b)+'</span></div>';function detail(i){const r=fleet.rows[i];if(!r)return;document.querySelector('#details').innerHTML='<div class="eyebrow">'+e(r.provider)+' worktree</div><h2>'+e(r.project)+'</h2><div class="detail"><h3>Current state</h3>'+item('Worktree',r.worktree)+item('Branch',r.branch)+item('Activity',r.activity)+item('State',r.status)+'</div><div class="detail"><h3>Recent sessions</h3>'+(r.sessions.length?r.sessions.map(s=>item(s.provider,s.name+' · '+s.activity)).join(''):'<p>No matching session metadata.</p>')+'</div><div class="detail"><h3>Instructions</h3>'+r.instructions.map(x=>item(x.name,x.provider+' · '+x.scope)).join('')+'</div><div class="detail"><h3>Skills</h3>'+r.skills.map(x=>item(x.name,x.provider+' · '+x.scope)).join('')+'</div>';document.querySelector('#drawer').classList.add('open');document.querySelector('#drawer').setAttribute('aria-hidden','false')}function render(){document.querySelector('#stamp').textContent=fleet.rows.length+' worktrees · updates every '+fleet.refreshSeconds+'s';document.querySelector('#notice').textContent=fleet.policy;document.querySelector('#rows').innerHTML=fleet.rows.map((r,i)=>'<tr data-row tabindex="0" onclick="detail('+i+')"><td><span class="project">'+e(r.project)+'</span><span class="sub">'+e(r.worktree)+'</span></td><td>'+e(r.provider)+(r.sessions[0]?'<span class="sub">'+e(r.sessions[0].provider)+' session</span>':'')+'</td><td><span class="sub">'+e(r.branch)+'</span></td><td><span class="dot '+e(r.freshness)+'">'+e(r.activity)+'</span></td></tr>').join('')||'<tr><td colspan="4">No worktrees discovered.</td></tr>'}async function refresh(){fleet=await fetch('/api/fleet').then(r=>r.json());render()}document.querySelector('#close').onclick=()=>document.querySelector('#drawer').classList.remove('open');refresh();setInterval(refresh,20000);</script></body></html>`;
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
