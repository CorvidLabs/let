# let

**Universal agent-asset locator + dynamic workbed** for multi-host coding agents (Claude Code, Grok Build, Codex, Cursor, Merlin, corvid-agent, and private runners).

> Agents should be able to **find anything agent** for any agent — including host-owned paths like `.claude/worktrees/`.

```bash
let where .                    # what agent stuff is here?
let find worktrees --json      # Claude + Codex + Cursor + git + … (deduped)
let find skills --json
let doctor --json
```

**Federation over relocation:** `let` indexes host assets *in place*. It does not migrate `.claude/worktrees/` into `.let/`.

Design: [`docs/design.md`](docs/design.md)

## Status

**PR1b (current, local):** federated `find` / `where` / `context` — indexes host worktrees in place (`.claude/worktrees`, `.worktrees`, `~/.codex/worktrees`, git porcelain, Grok `worktrees.db` enrichment). Local testing only; not published.

**Next:** progressive `show`/`open` (PR2), MCP read (PR2b).

Public npm publish is gated on **v0.2 MCP read path** (see design).

## Install (dev)

```bash
bun install
bun link          # optional: put `let` on PATH
./bin/let doctor --json
./bin/let find worktrees --cwd ~/path/to/repo --json
./bin/let where .
./bin/let context --json
bun test
```

## CorvidLabs stack

- Runtime: **Bun** + TypeScript  
- Lifecycle: **fledge** (`fledge run test`, `fledge run lint`)  
- Contracts: **specs/** (expand with spec-sync before publish)  
- Peers: agent-3md, fledge-plugin-memory, corvid-agent, merlin — `let` sits *below* hosts as shared infrastructure

## License

MIT
