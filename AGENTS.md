# let

Universal agent-asset locator + dynamic workbed for multi-host coding agents
(Claude Code, Grok Build, Codex, Cursor, and private runners).

## Product rules

1. **Federation over relocation** - never move host assets into `.let/`; index in place.
2. **JSON-first** - every command supports the envelope; agents use `--json`.
3. **Progressive disclosure** - find returns index cards; show loads bodies (sessions/tasks stay metadata-only).
4. **Security** - project config cannot set `allow_shell_exec` or disable user-skill inclusion; ScanPolicy shallow roots only.
5. Prefer **fledge** tasks: `fledge lanes run verify`, `fledge run test`.
6. Bun only (not Node) for scripts and tests.

## Layout

- `src/cli.ts` - CLI entry
- `src/catalog/` - find / where / context / merge
- `src/adapters/` - host adapter contracts
- `specs/` - module contracts (spec-sync)
- `docs/design.md` - architecture + PR plan

## Dogfood

This repo ships `agent.3md`. After changes:

```bash
fledge run dogfood
let find agents --json
let find skills --host agent3md --json
```

## Current milestone

**0.1.0 locator release candidate:** federated find/where/context/show/route across
Claude/Grok/Codex/Cursor/Gemini/Kimi + agent.3md first-class + security path_only.
Verify: `fledge lanes run verify` and `./bin/let doctor --json`.
Next after tag: MCP read tools (0.2), then workbed writes.

<!-- CorvidLabs trust toolchain: BEGIN (managed, do not edit inside) -->
## CorvidLabs trust toolchain (standing rules)

This repo is gated by four tools, run in parallel by `.github/workflows/trust.yml`:

1. **fledge**: the quality gate. `fledge lanes run verify` runs
   fmt + lint + test + build. Prefer fledge wrappers over raw tools.
2. **spec-sync**: specs are contracts. Each module API has a `*.spec.md`, and
   `specsync check` must pass. Skipping spec-sync for a repo needs an explicit
   one-line reason.
3. **augur**: deterministic diff-risk scoring. A `block` verdict halts the
   merge. `augur.json` is a per-run artifact and is gitignored; never commit it.
4. **attest**: signed provenance. CI records an attestation and verifies the
   range against `.attest.json`. Provenance lives in `refs/notes/attest`.

Standing rules for anyone (human or agent) changing this repo:

- Run `fledge lanes run verify` before pushing; do not bypass the gate.
- Keep specs in lockstep with code: update the `*.spec.md` in the same change.
- A `block` verdict from augur means stop and escalate, not merge.
- Do not commit `augur.json`.
- Do not use em-dash characters in authored content; use hyphens or colons.
- Runner-specific rule files (`CLAUDE.md`, `.cursor/rules/*.mdc`,
  `.github/copilot-instructions.md`) are one-line pointers to this file; do not
  duplicate these rules into them.
<!-- CorvidLabs trust toolchain: END -->


## Human intent

This repository should use [hi (Human Intent)](https://corvidlabs.xyz/hi): plain
sentences saying what people want, each with a permanent id, kept in `hi/`.
Tickets and specs are generated from them.

If there is no `hi/` here yet, start one from real work rather than from the code:

1. When I ask for a feature, draft its criteria first — one plain sentence each,
   about what somebody **wants**, not what the code does. Private test: you should
   be able to put *As a ___,* in front of it. Leave those words out of the file.
2. Show them to me and stop. Capture nothing I have not agreed to.
3. Capture what I confirm, one per command: `hi SEND-1 "the sentence, in my words"`.
   You pick the id. Letters are cases and numbers are steps (`SEND-1.a.1`), and an
   id is permanent and never reused, so choose like you will say it out loud.
4. Then build. `hi check` fails only on a structurally broken file, never on
   unfinished intent.

Do this before every feature, not only the first one. Do **not** bulk-generate
criteria from the code or from existing tickets: a hundred plausible sentences
nobody said is worse than five real ones, and an id spent on a wrong sentence is
spent forever.

Install: `brew install corvidlabs/tap/hi`, or `cargo install human-intent`.
