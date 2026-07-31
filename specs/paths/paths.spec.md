---
module: paths
version: 1
status: active
files:
  - src/paths.ts
db_tables: []
depends_on: []
---

# Paths

## Purpose

Host and project path helpers for Claude, Grok, Codex, Cursor, and let directories,
plus Claude project path encoding.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `homeDir` | User home directory. |
| `claudeHome` | `~/.claude`. |
| `grokHome` | `~/.grok`. |
| `codexHome` | `~/.codex`. |
| `cursorHome` | `~/.cursor`. |
| `geminiHome` | `~/.gemini`. |
| `kimiHome` | `~/.kimi-code`. |
| `projectClaudeDir` | `<repo>/.claude`. |
| `projectGeminiDir` | `<repo>/.gemini`. |
| `projectLetDir` | `<repo>/.let`. |
| `absPath` | Resolve path against cwd. |
| `encodeClaudeProjectPath` | Encode absolute path like Claude `projects/` dir names. |
| `decodeClaudeProjectPath` | Best-effort reverse of Claude project dir encoding. |
| `claudeProjectDir` | `~/.claude/projects/<encoded>`. |

## Invariants

1. Encode maps `/` and `_` to `-` with a leading `-` for absolute paths.
2. Helpers do not create directories.

## Behavioral Examples

```
Given /Users/leif/Development/_CorvidLabs/quill
When encodeClaudeProjectPath runs
Then result is -Users-leif-Development--CorvidLabs-quill
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| (none) | pure path join/encode | No throws for normal inputs. |

## Dependencies

- (none)

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Initial path helpers. |
