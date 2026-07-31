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
  - src/catalog/agent3md.ts
  - src/catalog/show.ts
  - src/catalog/route.ts
  - src/catalog/gemini.ts
  - src/catalog/kimi.ts
  - src/catalog/claude.ts
  - src/catalog/grok.ts
  - src/catalog/codex.ts
  - src/catalog/cursor.ts
  - src/catalog/let-assets.ts
  - src/catalog/mcp.ts
  - src/catalog/scope.ts
  - src/catalog/card-factory.ts
db_tables: []
depends_on:
  - git
  - config
---

# Catalog

## Purpose

Federated discovery of agent assets across hosts into the **let standard**:
one closed kind set, host-neutral IndexCards, progressive disclosure.
Worktrees are merged by realpath (git seeds, host overlays). Skills,
instructions, agents, commands, plugins, MCP, tasks, memory, and workflows
are progressive index cards. agent.3md / 3md is first-class.
Context packs never include session paths or bodies.

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
| `findInstructions` | Discover CLAUDE.md, AGENTS.md, cursor rules, host globals, etc. |
| `findSkills` | Project + user skill catalogs with progressive cards. |
| `findAgent3mdAgents` | Discover agent.3md / *.3md via @corvidlabs/agent3md (3md). |
| `findAgent3mdSkills` | Skill planes from agent.3md as progressive cards. |
| `listAgent3mdFiles` | Absolute paths of discovered agent.3md documents. |
| `showAsset` | Progressive body (or metadata) for one card by kind + id/name. |
| `openPath` | Classify path + capped preview; refuse session jsonl bodies. |
| `resolveCard` | Resolve id/name/path to a unique IndexCard. |
| `routeSkills` | Rank skills for a query (agent.3md route + triggers + name). |
| `tokenize` | agent.3md-compatible word tokens. |
| `phraseHits` | Trigger phrase match (all words required). |
| `findGeminiInstructions` | GEMINI.md + ~/.gemini global. |
| `findGeminiSessions` | Path-only history/projects. |
| `findGeminiMemory` | Antigravity brain/knowledge path-only. |
| `findKimiSessions` | Path-only workspaces/sessions via workspaces.json. |
| `findKimiMemory` | Path-only user-history. |
| `findMcpConfigs` | Federated MCP config paths across hosts. |
| `findClaudeCommands` | Project + user .claude/commands. |
| `findClaudePlugins` | installed_plugins + marketplace/cache path cards. |
| `findClaudeTasks` | ~/.claude/tasks path-only. |
| `findGrokSessions` | URL-encoded project session dirs path-only. |
| `findGrokMemory` | ~/.grok/memtrace path-only. |
| `findCodexSessions` | Shallow ~/.codex/sessions path-only. |
| `findCursorSessions` | ~/.cursor/chats path-only. |
| `findCursorTasks` | ~/.cursor/plans (showable markdown). |
| `findLetMemory` | .let/memory and ~/.let/memory. |
| `findLetSuperskills` | .let/superskills TOML/md/3md. |

### Structs & Enums

| Type | Description |
|------|-------------|
| `HostId` | claude, grok, codex, cursor, gemini, kimi, git, project, corvid, let, agent3md, unknown. |
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
9. Memory cards are path-only; `show memory` never dumps store contents.
10. agent.3md skill cards carry `meta.format=agent.3md` and `meta.z`.
11. Every FindKind is implemented (no empty stub kinds that always return []).

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
| 2 | 2026-07-31 | Full host federation: memory/plugins/mcp/tasks/commands; agent.3md first-class. |
