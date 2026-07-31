---
module: envelope
version: 1
status: active
files:
  - src/envelope.ts
db_tables: []
depends_on:
  - errors
---

# Envelope

## Purpose

JSON response envelope for CLI `--json` and future MCP tool results. Success and
error share one outer shape so agents can always parse stdout.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `baseMeta` | Build `EnvelopeMeta` with version, cwd, and duration from `startedAt`. |
| `successEnvelope` | Build `{ ok: true, command, data, meta }`. |
| `errorEnvelope` | Build `{ ok: false, command, error, meta }` from a `LetError`. |
| `withEnvelope` | Run a sync/async body; always return an envelope, mapping throws via `toLetError`. |
| `printEnvelope` | Write envelope JSON to stdout. |

### Structs & Enums

| Type | Description |
|------|-------------|
| `EnvelopeMeta` | `version`, `cwd`, `duration_ms`, optional `adapters` / `truncated` / `total`. |
| `SuccessEnvelope` | Discriminated success envelope. |
| `ErrorEnvelope` | Discriminated error envelope with `{ code, message, details }`. |
| `Envelope` | Union of success and error envelopes. |

### Constants

| Name | Description |
|------|-------------|
| `LET_VERSION` | Package version string embedded in meta. |

## Invariants

1. Every CLI machine-readable path returns an envelope (success or error).
2. `ok: true` envelopes never include an `error` field.
3. `ok: false` envelopes never include a successful `data` payload.
4. `duration_ms` is non-negative.
5. `withEnvelope` never rethrows: throws become `error` envelopes.

## Behavioral Examples

```
Given a body that returns { version: "0.1.0" }
When withEnvelope("version", body) runs
Then ok is true and data.version is "0.1.0"
```

```
Given a body that throws LetError("dependency", "not yet")
When withEnvelope("find", body) runs
Then ok is false and error.code is "dependency"
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| thrown LetError | body throws LetError | Mapped into ErrorEnvelope with same code/message/details. |
| thrown Error | body throws generic Error | Mapped to code `internal` via `toLetError`. |
| unknown throw | body throws non-Error | Mapped to code `internal` with String(value). |

## Dependencies

- `./errors` - `LetError`, `toLetError`, `LetErrorCode`.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Initial envelope contract for PR1. |
