---
module: web
version: 1
status: active
files:
  - src/web.ts
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
| `parseLocalAgentProcessLines` | Parse only whitelisted agent CLI processes and resolve their cwd internally. |
| `FleetSnapshot` | Sanitized rows, bounded session metadata, refresh interval, and policy. |

## Invariants

1. `let web` binds only to `127.0.0.1` and defaults to port `8731`.
2. Fleet data is derived from Let catalog APIs, not parsed terminal output.
3. Responses never include filesystem paths, session bodies, terminal output,
   secrets, browser shell endpoints, or agent-control actions.
4. Repository cards group worktrees first; sessions remain secondary evidence.
5. Working now comes only from a local process probe with exact agent CLI executable allowlist and cwd resolution. Session timestamps never prove a process is running.
6. Unmapped live processes are surfaced as Unassigned running agent and agent type only; their current working directories never leave the process probe.
7. Worktrees, sessions, instructions, and skills are capped before rendering.
8. Session-only records are bounded and include metadata only.
9. The normal CLI exits after ordinary commands, but remains alive while `web`
   owns the local server.
10. The agent view distinguishes a process-backed `Working now` status from recent or historical session metadata; no session record is represented as a running process.
11. The process probe may inspect a bounded descendant tree internally to classify an allowlisted operation label, but it never exposes command text, arguments, process IDs, or working-directory paths.

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
