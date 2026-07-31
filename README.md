# let

**Universal agent-asset locator + dynamic workbed** for multi-host coding agents
(Claude Code, Grok Build, Codex, Cursor, Merlin, corvid-agent, and private runners).

Agents should be able to **find any agent asset for any agent** - including
host-owned paths like `.claude/worktrees/`.

```bash
let where .                    # what agent stuff is here?
let find worktrees --json      # Claude + Codex + Cursor + git + …
let find skills --json
let doctor --json
```

**Federation over relocation:** `let` indexes host assets *in place*. It does
not migrate `.claude/worktrees/` into `.let/`.

Design: [`docs/design.md`](docs/design.md)

## Status

Early public development under CorvidLabs standards (fledge + spec-sync + Trust
CI). Package is not published to npm yet (gated on MCP read path; see design).

## Install (dev)

```bash
bun install
bun link          # optional: put `let` on PATH
./bin/let doctor --json
./bin/let find worktrees --cwd ~/path/to/repo --json
./bin/let where .
./bin/let context --json
```

## CorvidLabs stack

| Tool | Role |
|------|------|
| **fledge** | Lifecycle: `fledge lanes run verify` |
| **spec-sync** | Module contracts under `specs/` |
| **Trust CI** | `.github/workflows/trust.yml` (fledge + spec-sync + augur + attest) |
| **Bun** | Runtime and tests |

```bash
fledge lanes run verify   # local quality gate (same as CI lifecycle)
fledge run test
fledge spec check
```

Peers: [agent-3md](https://github.com/CorvidLabs/agent-3md),
[fledge](https://github.com/CorvidLabs/fledge),
[spec-sync](https://github.com/CorvidLabs/spec-sync),
[corvid-agent](https://github.com/CorvidLabs/corvid-agent) - `let` sits *below*
hosts as shared infrastructure.

## License

MIT
