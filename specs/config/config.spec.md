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
| `LetConfig` | find limits, scan policy flags, worktree base_dir, allow_shell_exec. |
| `LoadedConfig` | config + sources map + resolved user/project paths. |
| `ConfigSource` | default \| user \| env \| project. |
| `DEFAULT_LIMIT` | Default find limit (100). |
| `MAX_LIMIT` | Maximum allowed limit (500). |
| `DEFAULT_CONFIG` | Safe defaults (shell exec off, include_user_skills true). |
| `loadConfig` | Merge defaults, user config, env, sanitized project config. |
| `userConfigPath` | Path to the user config file. |
| `projectConfigPath` | Path to project `.let/config.toml` for a cwd. |

## Invariants

1. Project config cannot set `allow_shell_exec`.
2. Project config cannot set `find.include_user_skills`.
3. Project config cannot set `scan.follow_symlinks_outside_root`.
4. `default_limit` and `max_limit` are clamped to `[1, MAX_LIMIT]`.
5. Defaults keep `allow_shell_exec = false`.

## Behavioral Examples

```
Given no config files
When loadConfig runs
Then allow_shell_exec is false and include_user_skills is true
```

```
Given project .let/config.toml sets allow_shell_exec = true
When loadConfig runs
Then allow_shell_exec remains false
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| invalid project toml | parse failure | Fall back; ignore project security keys. |

## Dependencies

- (none) for security-key policy; filesystem for load.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Initial config trust model. |
| 2 | 2026-07-31 | Full export documentation for spec-sync 5.2. |
