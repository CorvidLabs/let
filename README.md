# let

🧭 **Find any agent asset for any agent.**

Host-neutral locator + dynamic workbed for multi-host coding agents (Claude Code,
Grok Build, Codex, Cursor, Merlin, corvid-agent, private runners).

```bash
let where .                         # what agent stuff is here?
let find worktrees --json           # .claude/worktrees + ~/.codex + git + …
let find skills --json              # Claude + Grok + Cursor + OpenAI + agent.3md planes
let find agents --json              # agent.3md + host agent dirs
let find memory --json              # memtrace / codex / gemini / .let (path-only)
let find sessions --json            # all hosts, path-only
let find plugins --json
let find mcp --json
let skill route "find worktrees" --json
let show skill find-worktrees --json  # progressive body load
let open ./agent.3md --json
let context --json
let doctor --json
let web                              # local, read-only Fleet dashboard
```

**Federation over relocation:** indexes host assets *in place* — never migrates
`.claude/worktrees/` into `.let/`.

| | |
|--|--|
| **Repo** | https://github.com/CorvidLabs/let |
| **Package** | `@corvidlabs/let` **0.1.0** (GitHub; npm after MCP read path) |
| **Stack** | Bun · fledge · spec-sync 5.2 · Trust CI · agent.3md |
| **Changelog** | [CHANGELOG.md](CHANGELOG.md) |

## Features

- **The let standard** — one closed kind set for every host; cards first, bodies on demand
- **Worktrees** — git seed + Claude / Codex / Cursor / project / Grok DB, deduped by realpath
- **Skills** — Claude, Grok, Cursor, Codex, OpenAI, let catalogs + **agent.3md skill planes**
- **Agents** — agent.3md / `*.3md` first-class + Claude/Codex/Cursor/Grok/Gemini/Kimi roots
- **Commands** — Claude + Cursor slash-commands (project + user)
- **Sessions / memory** — path-only federation (Claude, Grok, Codex, Cursor, Gemini, Kimi)
- **Plugins / MCP / tasks** — Claude plugins & tasks, Cursor plans, MCP configs across hosts
- **Workflows / superskills** — let-native + Grok workflow roots when present
- **Show / open / route** — progressive bodies + agent.3md-first skill ranking
- **Hosts** — Claude, Codex, Cursor, Grok, OpenAI, Gemini, Kimi Code, agent.3md, let
- **Dogfood** — ships `agent.3md` and can find + show + route itself
- **JSON-first** — stable envelopes for agents (`--json`)

## Install

### Via fledge (recommended for CorvidLabs projects)

```bash
fledge plugins install CorvidLabs/let
# or from a local checkout:
# fledge plugins install /path/to/let --force

fledge let doctor --json
fledge let find worktrees --json
fledge let where .
```

Any project that already uses fledge can install `let` the same way as
`fledge-plugin-memory` / `fledge-plugin-github`. Agents then call `fledge let …`
without a separate PATH setup.

### Local Fleet view

```bash
let web
# or: fledge let web
```

Starts a local-only dashboard at `http://127.0.0.1:8731`. Fleet is a Let-native
control room built from the federated index: it shows each local agent's status,
task or latest prompt, activity, timestamps, and project context. Expanded
cards may show bounded, redacted local session text from an already-indexed
session file. It never provides agent controls or shell execution.

### Standalone (any host: Claude, Codex, Cursor, Kimi, …)

```bash
git clone https://github.com/CorvidLabs/let
cd let
bun install
bun link          # or: ./bin/let
let doctor --json
```

If the shell `let` builtin shadows the binary, use `./bin/let` or
`bun run src/cli.ts`.

## Docs

| Doc | |
|-----|--|
| [docs/usage.md](docs/usage.md) | CLI + library |
| [docs/dogfood.md](docs/dogfood.md) | Self-use / agent.3md |
| [docs/design.md](docs/design.md) | Architecture + PR plan |
| [docs/README.md](docs/README.md) | Doc index |
| [agent.3md](agent.3md) | Agent identity + skills (3md) |
| [specs/](specs/) | Module contracts (spec-sync) |

## CorvidLabs toolchain

```bash
fledge lanes run verify   # test + lint + build + dogfood + specs
fledge run test
fledge run dogfood
fledge spec check
```

CI: `.github/workflows/trust.yml` (fledge + spec-sync + augur + attest).

## Peers

- [agent-3md](https://github.com/CorvidLabs/agent-3md) — one file is a whole agent (3md)
- [3md](https://github.com/CorvidLabs/3md) — markdown with a Z axis
- [fledge](https://github.com/CorvidLabs/fledge) · [spec-sync](https://github.com/CorvidLabs/spec-sync)
- [corvid-agent](https://github.com/CorvidLabs/corvid-agent)

`let` sits *below* host products as shared discovery infrastructure.

## License

MIT
