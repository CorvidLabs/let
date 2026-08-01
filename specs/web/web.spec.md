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
| `startFleetWeb` | Start the local-only web server and return its URL and stop handle. |
| `FleetFreshness` | One of live, recent, stale, or unknown activity states. |
| `FleetSession` | Sanitized provider, session label, and bounded freshness metadata. |
| `FleetRow` | Sanitized worktree, activity, session, instruction, and skill summary. |
| `FleetSnapshot` | Sanitized rows, bounded session metadata, refresh interval, and policy. |

## Invariants

1. `let web` binds only to `127.0.0.1` and defaults to port `8731`.
2. Fleet data is derived from Let catalog APIs, not parsed terminal output.
3. Responses never include filesystem paths, session bodies, terminal output,
   secrets, browser shell endpoints, or agent-control actions.
4. Worktrees, sessions, instructions, and skills are capped before rendering.
5. Session-only records are bounded and include metadata only.
6. The normal CLI exits after ordinary commands, but remains alive while `web`
   owns the local server.

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
