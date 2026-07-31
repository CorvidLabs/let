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

Scopes: `--scope project|user|all` (default `project`).

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
