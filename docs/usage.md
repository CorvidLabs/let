# Usage

## Install

### fledge plugin (CorvidLabs projects)

```bash
fledge plugins install CorvidLabs/let
fledge let find worktrees --json
fledge let where .
fledge let skill route "find worktrees" --json
```

Uses the same fledge-v1 plugin protocol as other CorvidLabs plugins. Default
`--cwd` is the fledge project root when omitted.

### Standalone CLI

```bash
git clone https://github.com/CorvidLabs/let
cd let && bun install && bun link
let doctor --json
# or: ./bin/let doctor --json
```

## The let standard

`let` is the **host-neutral catalog** for coding-agent assets. It does not move
host files into `.let/`; it indexes them in place and surfaces one card shape
for every kind.

| Principle | Meaning |
|-----------|---------|
| Federation over relocation | Host paths stay put |
| Closed kinds | One enum for all hosts |
| Progressive disclosure | `find` = cards; `show` = body or metadata |
| agent.3md first-class | 3md agents + skill planes are native |
| Sessions/memory safe | Path-only; never dump transcripts |

## Commands

All commands accept `--json` (default machine path for agents).

### `let web`

Start the local, read-only Fleet dashboard.

```bash
let web
let web --port 8732
fledge let web
```

The dashboard binds only to `127.0.0.1` (default port `8731`) and refreshes
from Let's structured index cards. It puts agents first, with projects as a
secondary view. Expand an agent to inspect its redacted task context, command,
latest prompt or update, timestamps, and recent session output when locally
available. It never provides controls, shell execution, or unredacted secrets.

### `let history` (alias: `usage`)

Rank hosts and projects by session activity (path-only, no transcripts).

```bash
let history --json                    # default scope=user (this Mac)
let history --scope project --json    # current repo only
```

### `let mcp serve`

Read-only MCP server on stdio (JSON-RPC 2.0). Tools: `let_find`, `let_where`,
`let_context`, `let_show`, `let_doctor`, `let_route`, `let_history`.

```bash
let mcp serve
```

### Workbed

```bash
let init --json
let worktree list --json
let worktree add my-feature --json
let memory set note '{"hello":true}' --json
let memory list --json
let super init-example --json
let super list --json
let config show --json
```

### `let doctor`

Host roots, git/bun, config trust, agent.3md presence.

```bash
let doctor --json
```

### `let find <kind>`

Federated index cards.

```bash
let find worktrees --json
let find skills --query worktree --json
let find skills --host agent3md --json
let find agents --json
let find commands --json
let find memory --json
let find sessions --json            # path-only cards, never bodies
let find plugins --json
let find mcp --json
let find tasks --json
let find workflows --json
let find superskills --json
let find instructions --json
```

Kinds: `instructions`, `skills`, `agents`, `commands`, `worktrees`, `sessions`,
`tasks`, `memory`, `mcp`, `plugins`, `workflows`, `superskills`.

Hosts (`--host`): `claude`, `grok`, `codex`, `cursor`, `openai`, `gemini`, `kimi`,
`agent3md`, `git`, `project`, `let`, …

### Host × kind matrix

| Host | Worktrees | Skills | Agents | Commands | Sessions | Memory | Plugins | MCP | Tasks |
|------|-----------|--------|--------|----------|----------|--------|---------|-----|-------|
| claude | yes | yes | yes | yes | path-only | — | yes | settings/.mcp | path-only |
| grok | worktrees.db | yes | bundled | — | path-only | memtrace | — | — | — |
| codex | yes | optional | yes | — | path-only | sqlite/dir | yes | config path | — |
| cursor | weak | yes | yes | yes | chats path | — | — | mcp.json | plans |
| openai | — | yes | — | — | — | — | — | — | — |
| gemini | — | — | antigravity | — | history path | brain/knowledge | — | mcp_config | — |
| kimi | — | — | config path | — | workspaces path | user-history | — | — | — |
| agent3md | — | skill planes | agent.3md | — | — | — | — | — | — |
| let | `.let/worktrees` | `.let/skills` | `.let/agents` | — | `.let/sessions` | `.let/memory` | — | — | superskills |

Scopes: `--scope project|user|all` (default `project`). Project scope still
includes user skill/agent catalogs when `include_user_skills` is true (default).

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
let show memory <id> --json          # metadata only
let show sessions <id> --json        # metadata only
```

- **skills / instructions / agents**: full text body (agent.3md skills = plane body)
- **agent.3md agents**: identity body + skill catalog payload (not every plane body)
- **worktrees**: enrichment only (branch, head, exists)
- **sessions / memory / most tasks**: **metadata only**
- **cursor plans** (tasks): markdown body allowed
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
let route "list memory" --json
```

Each hit includes `score`, `hits` (matched phrases), `skill` card, `tool`
template, and `show` (command to load the body).

## agent.3md / 3md (let standard)

`let` depends on [`@corvidlabs/agent3md`](https://github.com/CorvidLabs/agent-3md)
(canonical 3md parser + agent loader).

Discovered paths:

- Project: `agent.3md`, root `*.3md`, `agents/*.3md`, `.let/agents/*.3md`
- User: `~/.let/agent.3md`, `~/.let/agents/*.3md`, and `*.3md` under host agent dirs

Behavior:

- `find agents` → agent documents (`host=agent3md`, `meta.format=agent.3md`)
- `find skills` → skill planes as progressive cards (`meta.z`, `triggers`, `tool`)
- `show agent <name>` → identity body + skill catalog payload
- `show skill <name>` → single plane body
- `skill route` → prefers agent.3md `Agent.route`, then triggers

This repo ships `agent.3md` describing `let` itself (dogfood).

## Library

```ts
import { buildScanContext, findAssets, whereAmI, routeSkills } from "@corvidlabs/let";

const ctx = buildScanContext({ cwd: process.cwd() });
const trees = await findAssets("worktrees", ctx);
const memory = await findAssets("memory", ctx, { host: "grok" });
const here = whereAmI(ctx);
const ranked = await routeSkills("find skills about worktrees", ctx);
```

## Quality gate

```bash
fledge lanes run verify
```
