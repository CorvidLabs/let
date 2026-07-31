---
module: catalog
version: 1
status: active
files:
  - src/catalog/types.ts
  - src/catalog/ids.ts
  - src/catalog/find.ts
  - src/catalog/merge.ts
  - src/catalog/where.ts
  - src/catalog/context.ts
  - src/catalog/context-builder.ts
  - src/catalog/instructions.ts
  - src/catalog/skills.ts
  - src/catalog/scan-policy.ts
db_tables: []
depends_on:
  - git
  - config
---

# Catalog

## Purpose

Federated discovery of agent assets across hosts. Worktrees are merged by
realpath (git seeds, host overlays). Skills and instructions are progressive
index cards. Context packs never include session paths or bodies.

## Public API

### Exported Functions

| Export | Description |
|--------|-------------|
| `isFindKind` | Type guard for FindKind. |
| `isFindScope` | Type guard for project \| user \| all. |
| `worktreeId` | Stable `worktrees:${hash16(realpath)}` without host. |
| `skillId` | Path-unique skill id including host. |
| `findAssets` | Federated find for a kind with optional host/query filter. |
| `federateWorktrees` | Merge git + host worktree candidates; dedupe by realpath. |
| `attributeHost` | Path-prefix host attribution (claude, codex, cursor, project, let, git). |
| `isWorktreeCandidateForRepo` | Repo-attributable checkout test for scope=project. |
| `whereAmI` | Classify a path; related siblings/instructions; sessions always []. |
| `buildContext` | brief/full pack; sessions always empty. |
| `buildScanContext` | Build ScanContext from cwd/repo/scope/limit. |
| `findInstructions` | Discover CLAUDE.md, AGENTS.md, cursor rules, etc. |
| `findSkills` | Project + user skill catalogs with progressive cards. |

### Structs & Enums

| Type | Description |
|------|-------------|
| `HostId` | claude, grok, codex, cursor, git, project, corvid, let, agent3md, unknown. |
| `FindKind` | Closed catalog kinds (worktrees, skills, instructions, sessions, ...). |
| `FindScope` | project \| user \| all. |
| `IndexCard` | Progressive disclosure card (no large bodies). |
| `WorktreeCard` | Worktree index card with status and managed_by. |
| `FindResult` | kind, scope, repo_root, items, total, truncated. |
| `WhereResult` | Classification + related.sessions always []. |
| `ContextResult` | Pack with sessions never[]. |
| `ScanPolicy` | Fixed-root shallow scan limits and deny basenames. |

### Constants

| Name | Description |
|------|-------------|
| `FIND_KINDS` | Runtime list of all FindKind values. |
| `DEFAULT_SCAN_POLICY` | Default max entries/duration and deny list. |

## Invariants

1. Worktree ids never include host; re-attribution does not change id.
2. Federated worktree paths are unique by realpath (no double-count).
3. `where.related.sessions` is always `[]` in v0.
4. `context.sessions` is always `[]` (brief and full packs).
5. `scope=project` filters host worktree candidates with repo attribution rules.
6. `scope=user|all` does not apply belongsToRepo filter on host candidates.
7. Card lists honor limit; set truncated + total when clipped.
8. Session cards are path-only (no transcript bodies).

## Behavioral Examples

```
Given a quill-shaped repo with .claude/worktrees and git-linked Codex trees
When findAssets("worktrees", projectScope) runs
Then each realpath appears once and Claude trees have host=claude
```

```
Given cwd inside .claude/worktrees/wf_1
When whereAmI runs
Then host is claude, kind is worktrees, related.sessions is []
```

```
Given buildContext(ctx, "full")
When the pack is returned
Then sessions is [] and worktrees.sample is capped
```

## Error Cases

| Error | When | Behavior |
|-------|------|----------|
| unknown kind | findAssets invalid kind | Throws LetError validation. |
| non-git cwd | no repoRoot | Worktree seed empty; host scans may still return user-scope candidates. |
| missing host dirs | adapter roots absent | Skip silently; never throw. |

## Dependencies

- `../git` - porcelain list, common-dir, toplevel.
- `../config` - limits and include_user_skills.
- `../paths` - host home roots.
- `../fs-scan` - shallow listing and frontmatter parse.

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2026-07-30 | Federated find/where/context (PR1b). |
