# Changelog

All notable changes to `@corvidlabs/let` are documented here.

## [0.2.0] - 2026-07-31

Full locator + workbed surface on top of 0.1.0 federation.

### Added

- **`let history`** (alias `usage`) — hosts and projects ranked by session activity (path-only)
- **`let mcp serve`** — read-only MCP stdio server: `let_find`, `let_where`, `let_context`, `let_show`, `let_doctor`, `let_route`, `let_history`
- **`let init`** — bootstrap `.let/` workbed dirs
- **`let worktree list|add|remove`** — list federated trees; add/remove under `.let/worktrees`
- **`let memory list|get|set|delete`** — local key/value memory (project or user)
- **`let super list|get|init-example`** — superskill TOML cards
- **`let config show`** — loaded config + sources
- **`let skill list|get`** — aliases over find/show skills
- Deeper Claude user session cards (`jsonl_count` + latest mtime per project dir)

### Security

- History and MCP tools never load session/memory bodies
- Memory writes only under `.let/memory` / `~/.let/memory`

## [0.1.0] - 2026-07-31

First public locator release of the **let standard**: federated discovery of agent
assets in place (no relocation into `.let/`).

### Added

- **CLI (JSON-first):** `doctor`, `find`, `where`, `context`, `show`, `open`,
  `skill route` (alias `route`), `version`, `help`
- **Kinds:** `instructions`, `skills`, `agents`, `commands`, `worktrees`,
  `sessions`, `tasks`, `memory`, `mcp`, `plugins`, `workflows`, `superskills`
- **Hosts:** Claude, Grok, Codex, Cursor, Gemini, Kimi Code, git, project, let,
  agent.3md
- **agent.3md / 3md:** first-class agents and skill planes via
  `@corvidlabs/agent3md` (find / show / route)
- **Worktree federation:** git seeds + host overlays, realpath dedupe
- **Progressive disclosure:** cards on find; bodies on show; sessions/memory
  metadata-only
- **Security:** path_only / deny basenames; project scope does not dump global
  sessions/memory; open refuses secret-bearing configs
- **fledge plugin:** `fledge plugins install CorvidLabs/let` → `fledge let …`
- **Specs:** module contracts under `specs/` (spec-sync 5.2)
- **Dogfood:** repo ships `agent.3md` describing `let` itself

### Not in 0.1.0 (later)

- MCP server export of catalog tools (design v0.2 publish gate for npm)
- Write path: `.let` worktrees, memory, superskill runtime
- Cross-host session correlation / transcript bodies

### Install

```bash
# fledge (CorvidLabs projects)
fledge plugins install CorvidLabs/let
fledge let doctor --json

# standalone
git clone https://github.com/CorvidLabs/let
cd let && bun install && bun link
let doctor --json
```
