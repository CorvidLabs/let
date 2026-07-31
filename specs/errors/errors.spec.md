---
module: errors
version: 1
status: active
files:
  - src/errors.ts
db_tables: []
depends_on: []
---

# Errors

## Purpose

Typed errors for library, CLI, and MCP surfaces with stable codes and CLI exit
mapping.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `LetErrorCode` | Closed set: usage, validation, not_found, conflict, unsafe, dependency, internal. |
| `LetError` | Error subclass with `code`, `details`, `exitCode`, `toJSON()`. |
| `isLetError` | Type guard for `LetError` instances. |
| `toLetError` | Map unknown throwables into `LetError` (identity for LetError). |

### Exit code mapping

| Code | Exit |
|------|------|
| usage, validation | 1 |
| not_found | 2 |
| conflict, unsafe | 3 |
| dependency | 4 |
| internal | 10 |

## Invariants

1. `LetError.code` is always one of the closed `LetErrorCode` values.
2. `exitCode` is derived only from `code` (no free-form mapping).
3. `toLetError(letError)` returns the same instance identity path as `isLetError`.
4. `toJSON()` never includes a stack trace field (message/code/details only).

## Behavioral Examples

```
Given new LetError("not_found", "missing", { id: "x" })
When exitCode is read
Then it equals 2
```

```
Given toLetError(new Error("boom"))
When code is read
Then it equals "internal"
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| non-Error throw | `toLetError("x")` | Becomes internal with message "x". |
| LetError passthrough | `toLetError(existing)` | Returns the same LetError. |

## Dependencies

- (none) - leaf module.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Initial error contract. |
| 2 | 2026-07-31 | Full export documentation for spec-sync 5.2. |
