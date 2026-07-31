# catalog / FindKind

| Name | Kind | Description |
|------|------|-------------|
| `FindKind` | type | Closed enum of federated asset kinds: instructions, skills, agents, commands, worktrees, sessions, tasks, memory, mcp, plugins, workflows, superskills |
| `FIND_KINDS` | constant | Runtime list of all FindKind values |
| `isFindKind` | function | Type guard: string is FindKind |
| `IndexCard` | type | Progressive-disclosure card: id, kind, host, name, path, optional repo_root/summary/meta |
| `WorktreeCard` | type | IndexCard for worktrees with branch, status, managed_by, optional git_common_dir |
| `HostId` | type | claude, grok, codex, cursor, git, project, corvid, let, agent3md, unknown |
| `FindScope` | type | project \| user \| all |

## Notes

- Worktree `id` is `worktrees:${hash16(realpath)}` — **not** host-prefixed (see design.md).
- PR1a ships types only; PR1b implements find/merge.
