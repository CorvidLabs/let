# Dogfooding

`let` is meant to discover its own agent surface.

## Self-discovery

From the repo root:

```bash
let find instructions --json     # AGENTS.md, CLAUDE.md
let find agents --json           # agent.3md (host=agent3md)
let find skills --host agent3md --json
let where . --json
let doctor --json
```

## agent.3md

[`../agent.3md`](../agent.3md) is the agent.3md identity for this project:

- identity plane: operating rules for using `let`
- skills: find-worktrees, where, find-skills, context, doctor (bound to `let` CLI)

Any host that loads agent.3md can route to these skills; any host that only has
CLI can run the same commands via `let find` / `let where`.

## CI / fledge

```bash
fledge run dogfood    # self-check via the CLI
fledge lanes run verify
```

The dogfood task asserts that `let` can see its own `agent.3md` and instructions.
