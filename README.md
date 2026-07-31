# let

🧭 **Find any agent asset for any agent.**

Host-neutral locator + dynamic workbed for multi-host coding agents (Claude Code,
Grok Build, Codex, Cursor, Merlin, corvid-agent, private runners).

```bash
let where .                         # what agent stuff is here?
let find worktrees --json           # .claude/worktrees + ~/.codex + git + …
let find skills --host agent3md --json
let find agents --json              # agent.3md documents
let context --json
let doctor --json
```

**Federation over relocation:** indexes host assets *in place* — never migrates
`.claude/worktrees/` into `.let/`.

| | |
|--|--|
| **Repo** | https://github.com/CorvidLabs/let |
| **Package** | `@corvidlabs/let` (not on npm yet) |
| **Stack** | Bun · fledge · spec-sync · Trust CI · agent.3md |

## Features

- **Worktrees** — git seed + Claude / Codex / Cursor / project overlays, deduped by realpath
- **Skills** — Claude, Grok, Cursor catalogs + **agent.3md skill planes**
- **Agents** — discovers and validates `agent.3md` via `@corvidlabs/agent3md` (3md)
- **Instructions** — `CLAUDE.md`, `AGENTS.md`, Cursor rules, …
- **Dogfood** — this repo ships `agent.3md` and can find itself
- **JSON-first** — stable envelopes for agents (`--json`)

## Install (dev)

```bash
git clone https://github.com/CorvidLabs/let
cd let
bun install
bun link
let doctor --json
```

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
