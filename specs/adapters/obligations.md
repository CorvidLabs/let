# Adapter obligations (PR1 minimal)

Every host adapter MUST:

1. Emit only paths under its **ScanPolicy fixed roots** (no free path from CLI).
2. Respect **max depth** for that host (Codex: depth 2 + one `.worktrees/*` level).
3. **Not follow symlinks** outside the adapter root.
4. Never open secret bodies (`auth.json`, `history.jsonl` as asset bodies, credential files).
5. For `kind=sessions|tasks`, emit **path-only** cards (bytes/mtime optional); never transcript bodies.
6. Prefer **overlay attribution** when git already listed a realpath (do not double-count).
7. Set `host` and `managed_by` honestly; use `status=unknown` for non-git placeholders (e.g. empty Cursor dirs).

## PR1a status

- Types + doctor root checks only.
- Full adapters: PR1b (git, claude, project), PR3 (grok, codex, cursor), PR4 (agent3md, corvid, let).
