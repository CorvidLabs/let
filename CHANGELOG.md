# Changelog

All notable changes to `@corvidlabs/let` are documented here.

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
