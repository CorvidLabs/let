---
module: config
version: 1
status: active
files:
  - src/config.ts
db_tables: []
depends_on: []
---

# Config

## Purpose

Load and merge user / env / project configuration with a trust model: security
keys cannot be set from project-local config.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `loadConfig` | Merge defaults, user `~/.config/let/config.toml`, env, sanitized project `.let/config.toml`. |
| `userConfigPath` | Path to the user config file. |
| `projectConfigPath` | Path to project `.let/config.toml` for a cwd. |

### Structs & Enums

| Type | Description |
|------|-------------|
| `LetConfig` | find limits, scan policy flags, worktree base_dir, allow_shell_exec. |
| `LoadedConfig` | config + sources map + resolved user/project paths. |
| `ConfigSource` | default \| user \| env \| project. |

### Constants

| Name | Description |
|------|-------------|
| `DEFAULT_LIMIT` | 100 |
| `MAX_LIMIT` | 500 |
| `DEFAULT_CONFIG` | Safe defaults (shell exec off, include_user_skills true). |

## Invariants

1. Project config cannot set `allow_shell_exec`.
2. Project config cannot set `find.include_user_skills`.
3. Project config cannot set `scan.follow_symlinks_outside_root`.
4. `default_limit` and `max_limit` are clamped to `[1, MAX_LIMIT]`.
5. Defaults keep `allow_shell_exec = false`.

## Behavioral Examples

```
Given a project .let/config.toml with allow_shell_exec = true
When loadConfig(projectDir) runs
Then config.allow_shell_exec remains false
```

```
Given no config files
When loadConfig(tempDir) runs
Then find.default_limit is DEFAULT_LIMIT
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| missing files | user/project config absent | Silent: defaults (+ env) only. |
| unreadable TOML lines | malformed lines | Ignored; known keys still apply. |

## Dependencies

- `./paths` - `homeDir` for user config location.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Initial config trust contract. |
