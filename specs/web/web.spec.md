---
module: web
version: 1
status: active
files:
  - src/web.ts
  - src/fleet-adapters.ts
  - src/fleet-brand.ts
db_tables: []
depends_on:
  - catalog
---

# Web

## Purpose

Serve a local, read-only Fleet dashboard backed directly by Let's federated
index cards. The dashboard makes agent activity inspectable without becoming a
workflow engine or a remote-control surface.

## Public API

| Export | Description |
|--------|-------------|
| `buildFleetSnapshot` | Build a bounded, metadata-only Fleet snapshot from Let catalog APIs. |
| `fleetStateForSessions` | Classify observed heartbeats as Recent activity or History. |
| `fleetHtml` | Render the privacy-bounded local Fleet page. |
| `startFleetWeb` | Start the local-only web server and return its URL and stop handle. |
| `FleetFreshness` | One of live, recent, stale, or unknown activity states. |
| `FleetSession` | Sanitized provider, session label, and bounded freshness metadata. |
| `FleetState` | Recent activity or History repository activity classification. |
| `FleetWorktree` | Sanitized worktree and branch metadata belonging to a repository. |
| `FleetRepository` | Repository-first collection of worktrees and secondary session evidence. |
| `LiveAgent` | Whitelisted local CLI agent with an internal current working directory. |
| `WorkingAgent` | Sanitized live agent record matched to a repo/worktree or marked unassigned. |
| `FleetAgentActivity` | Safe agent-focused status derived from a local process or session metadata. |
| `selectAgentWorkContext` | Prefer a bounded child verifier worktree over its agent parent process context. |
| `redactLocalDetail` | Redact known token, credential, and environment-value patterns before local display. |
| `fleetContextLabels` | Build explicit project, worktree, and branch labels for agent supervision. |
| `parseLocalAgentProcessLines` | Parse only whitelisted agent CLI processes and resolve their cwd internally. |
| `FleetSnapshot` | Sanitized rows, bounded session metadata, refresh interval, and policy. |
| `FLEET_SESSION_ADAPTERS` | Let-native presentation adapters for Claude, Codex, Grok, Gemini, and Antigravity session cards. |
| `fleetAdapterFor` | Resolve the local Fleet presentation adapter for an indexed session card. |
| `fleetSessionDetail` | Extract bounded, redacted display text from an already-indexed local session file. |
| `FleetProvider` | Supported Fleet session-provider name. |
| `FleetSessionDetail` | Bounded local prompt and output detail plus an internal-only path for resolving sanitized project context. |
| `FleetSessionAdapter` | Host-card matching contract for Fleet's presentation adapters. |
| `CORVID_TOKENS_CSS` | Local serving copy of the CorvidLabs design-system token stylesheet. |
| `CORVID_THEME_JS` | Local serving copy of the standard CorvidLabs theme controller. |

## Invariants

1. `let web` binds only to `127.0.0.1` and defaults to port `8731`.
2. Fleet data is derived from Let catalog APIs, not parsed terminal output.
3. Responses never include raw secrets, browser shell endpoints, or agent-control actions. The localhost supervisor may include redacted session text, commands, and project context for active-agent supervision.
4. Repository cards group worktrees first; sessions remain secondary evidence.
5. Working now comes only from a local process probe with exact agent CLI executable allowlist and cwd resolution. Session timestamps never prove a process is running.
6. Unmapped live processes are surfaced as Unassigned running agent and agent type only; their current working directories never leave the process probe.
7. Worktrees, sessions, instructions, and skills are capped before rendering.
8. Session-only records are bounded and include metadata only.
9. The normal CLI exits after ordinary commands, but remains alive while `web`
   owns the local server.
10. The agent view distinguishes a process-backed `Working now` status from recent or historical session metadata; no session record is represented as a running process.
11. The process probe may inspect a bounded descendant tree internally to classify an allowlisted operation label; the localhost supervisor may show its redacted command and resolved project context, but never exposes process IDs.
12. The localhost supervisor may expose redacted command, prompt/update, and recent output only after applying `redactLocalDetail`; unavailable detail is labeled instead of inferred.
13. Agent context shows project, worktree, and branch independently when Let can resolve them; raw local paths never leave the server.
14. Fleet maps host session cards through explicit presentation adapters; it does not scan host paths independently of Let's catalog.
15. Gemini must be shown through its Gemini or Antigravity adapter when indexed, otherwise Fleet shows an explicit unavailable state.

## Behavioral Examples

```
Given multiple host worktrees and path-only sessions
When let web starts
Then the browser receives sanitized Fleet rows without transcript contents
```

```
Given `let web --port 8732`
When the server starts
Then the URL is http://127.0.0.1:8732 and no non-local interface is bound
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| invalid port | `--port` is not an integer from 1 to 65535 | Return a validation envelope. |
| unavailable port | local port already bound | Let reports Bun's startup failure; no fallback external binding. |

## Dependencies

- `./catalog/context-builder` - trusted scan context.
- `./catalog/find` - structured federated index cards.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-08-01 | Initial local read-only Fleet dashboard. |
