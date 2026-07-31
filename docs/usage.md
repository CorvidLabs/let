# Usage

## Install (dev)

```bash
git clone https://github.com/CorvidLabs/let
cd let
bun install
bun link    # optional: `let` on PATH
```

## Commands

All commands accept `--json` (default machine path for agents).

### `let doctor`

Host roots, git/bun, config trust.

```bash
let doctor --json
```

### `let find <kind>`

Federated index cards.

```bash
let find worktrees --json
let find worktrees --cwd /path/to/repo --json
let find skills --query worktree --json
let find skills --host agent3md --json
let find agents --json              # includes agent.3md
let find instructions --json
let find sessions --json            # path-only cards, never bodies
```

Kinds: `instructions`, `skills`, `agents`, `commands`, `worktrees`, `sessions`,
`tasks`, `memory`, `mcp`, `plugins`, `workflows`, `superskills`.

Hosts (`--host`): `claude`, `grok`, `codex`, `cursor`, `gemini`, `kimi`,
`agent3md`, `git`, `project`, …

| Host | Worktrees | Skills | Agents | Sessions | Instructions |
|------|-----------|--------|--------|----------|--------------|
| claude | yes | yes | yes | path-only | CLAUDE.md |
| codex | yes | — | yes | — | AGENTS.md (project) |
| cursor | weak | yes | yes | — | .cursorrules |
| grok | worktrees.db | yes | — | weak | project |
| gemini | — | — | antigravity | history path-only | GEMINI.md |
| kimi | — | — | config path-only | workspaces path-only | — |
| agent3md | — | planes | agent.3md | — | — |

Scopes: `--scope project|user|all` (default `project`).
Sessions/tasks always path-only (no transcript bodies).

### `let where [path]`

Classify cwd or path; sibling worktrees + instructions. `related.sessions` is
always `[]` in v0.

```bash
let where .
let where /path/to/.claude/worktrees/wf_1 --json
```

### `let context`

Brief or full pack. **Never** includes sessions.

```bash
let context --json
let context --pack full --cwd /path/to/repo --json
```

### `let show <kind> <id|name>`

Progressive disclosure: load the body (or metadata) for one card.

```bash
let show skill find-worktrees --json
let show agent let --json
let show instructions AGENTS.md --json
let show worktree <id> --json
```

- **skills / instructions / agents**: full text body (agent.3md skills = plane body)
- **worktrees**: enrichment only (branch, head, exists) — no tree dump
- **sessions / tasks**: **metadata only** (bytes, mtime) — never transcript text
- Ambiguous names return `conflict` with candidate ids

### `let open <path>`

Classify a filesystem path + small preview (8 KiB). Refuses session jsonl bodies.

```bash
let open ./agent.3md --json
let open ./AGENTS.md --json
```

### `let skill route <text>` (alias: `let route`)

Rank skills for a natural-language request. Uses agent.3md `Agent.route` when
possible, then trigger phrases, then name/description fallback.

```bash
let skill route "find worktrees for this repo" --json
let route "where am i" --host agent3md --json
```

Each hit includes `score`, `hits` (matched phrases), `skill` card, `tool`
template, and `show` (command to load the body).

## agent.3md / 3md

`let` depends on [`@corvidlabs/agent3md`](https://github.com/CorvidLabs/agent-3md)
(canonical 3md parser + agent loader).

- Discovers `agent.3md`, root `*.3md`, and `agents/*.3md`
- `find agents` → agent documents (`host=agent3md`)
- `find skills` → skill planes from those files (progressive cards)
- This repo ships `agent.3md` describing `let` itself (dogfood)

## Library

```ts
import { buildScanContext, findAssets, whereAmI } from "@corvidlabs/let";

const ctx = buildScanContext({ cwd: process.cwd() });
const trees = await findAssets("worktrees", ctx);
const here = whereAmI(ctx);
```

## Quality gate

```bash
fledge lanes run verify
```
