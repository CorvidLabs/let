---
module: git
version: 1
status: active
files:
  - src/git.ts
db_tables: []
depends_on: []
---

# Git

## Purpose

Thin wrappers around git porcelain for worktree federation: toplevel, common-dir,
branch, HEAD, and `git worktree list --porcelain` parsing.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `safeRealpath` | Realpath or resolved path; null on total failure. |
| `gitToplevel` | `git rev-parse --show-toplevel` or null. |
| `gitCommonDir` | Realpath of `git rev-parse --git-common-dir` or null. |
| `gitBranch` | Current branch name or null when detached/non-git. |
| `gitHead` | HEAD sha or null. |
| `gitWorktreeList` | Parsed porcelain entries with realpathed paths. |
| `mapGitStatus` | Map entry flags to active \| prunable \| locked. |

### Structs & Enums

| Type | Description |
|------|-------------|
| `GitWorktreeEntry` | path, head?, branch?, bare, detached, locked, prunable. |

## Invariants

1. Non-git directories return null/empty; helpers never throw for missing git.
2. Worktree list paths are realpathed when possible.
3. Branch refs strip `refs/heads/` prefix.
4. `mapGitStatus` prefers prunable over locked over active.

## Behavioral Examples

```
Given a normal git repo cwd
When gitToplevel(cwd) runs
Then it returns the repository root realpath
```

```
Given git worktree list --porcelain with a prunable entry
When mapGitStatus runs
Then status is "prunable"
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| git missing | git not on PATH | Helpers return null / []. |
| not a repo | cwd outside git | null / []. |

## Dependencies

- (none) - shells out to `git` binary only.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Initial git porcelain helpers. |
