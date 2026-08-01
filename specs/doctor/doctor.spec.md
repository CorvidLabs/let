---
module: doctor
version: 2
status: active
files:
  - src/doctor.ts
db_tables: []
depends_on:
  - config
---

# Doctor

## Purpose

Environment health report for host roots, git/bun availability, and config trust
defaults. Used by `let doctor --json`.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `DoctorCheck` | id, ok, detail, optional path. |
| `DoctorReport` | version, cwd, checks, roots map, config summary. |
| `runDoctor` | Produce a DoctorReport for a cwd (checks + roots + config summary). |

## Invariants

1. Missing host roots are reported as present/absent without throwing.
2. Report always includes a git check and bun check.
3. Config summary exposes allow_shell_exec and default_limit.
4. Codex worktrees root is noted as shallow-scan only when present.
5. OpenAI home and skills roots are reported when skill discovery supports OpenAI.

## Behavioral Examples

```
Given a machine with git and bun installed
When runDoctor(cwd) runs
Then checks include id "git" with ok true and id "bun" with ok true
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| git absent | git not on PATH | checks id git has ok false with detail. |
| root stat fails | permission error | check recorded with ok false; report still returns. |

## Dependencies

- `./config` - loadConfig for trust summary.
- `./paths` - host home and project paths.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 2 | 2026-08-01 | Report OpenAI home and skills roots. |
| 1 | 2026-07-30 | Initial doctor contract. |
