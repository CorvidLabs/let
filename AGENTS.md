# AGENTS.md — working on `let`

## What this is

`let` is a **host-neutral locator + workbed**. Primary job: any agent can discover any agent asset (skills, worktrees, sessions path-only, instructions, …) across Claude/Grok/Codex/Cursor/project/git layouts.

Read `docs/design.md` before implementing features.

## Rules

1. **Federation over relocation** — never move host assets into `.let/`; index in place.
2. **JSON-first** — every command supports envelope output; agents use `--json`.
3. **Progressive disclosure** — find returns index cards; show loads bodies (except sessions/tasks = metadata only).
4. **Security** — project config cannot set `allow_shell_exec` or disable user-skill inclusion; ScanPolicy shallow roots only.
5. Prefer **fledge** tasks: `fledge run test`, `fledge run lint`.
6. Bun only (not Node) for scripts and tests.

## Layout

- `src/cli.ts` — CLI entry
- `src/catalog/` — find/where/context (PR1b+)
- `src/adapters/` — host scanners (PR1b+)
- `specs/` — module contracts
- `docs/design.md` — architecture + PR plan

## Current milestone

PR1b local: `find` / `where` / `context` work.  
Verify with `./bin/let find worktrees --cwd <quill> --json` — expect claude + codex + project hosts, unique paths.
