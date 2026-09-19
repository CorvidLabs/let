---
hi: 1
families: [GUARD]
---

# Keeping private things private

## Intent

let reads a machine full of chat transcripts, credential files and other people's projects, so the most important thing about it is what it refuses to do. Transcripts should be known by their existence and never by their contents, and files that usually hold secrets should be listed by path and never opened. Scanning should stay inside a known set of folders so it can't be aimed at an arbitrary tree. A repository I just cloned should never be able to talk let into reading more or running more than it already could.

## Criteria

- **GUARD-1**  Finding, showing or opening a chat transcript gives me its size and age, never its contents.
- **GUARD-2**  A file that usually carries credentials is known by its path alone and never opened.
- **GUARD-3**  A settings file that can embed keys or environment values is indexed by its path and never read out.
- **GUARD-4**  Standing in one project, I'm not handed the sessions and memory of every other project on this machine.
- **GUARD-5**  A repository's own let settings can't grant it more reach than it already has.
  - **GUARD-5.a**  A repository can still choose harmless things, like where its own worktrees go.
  - **GUARD-5.b**  Only my own settings or my environment can loosen a safety setting.
- **GUARD-6**  Running shell commands on my behalf is off until I turn it on myself.
- **GUARD-7**  Scanning only ever visits the folders agents are known to use, so it can't be aimed at an arbitrary tree.
- **GUARD-8**  A symlink leading out of the folder being scanned isn't followed.
- **GUARD-9**  A folder I'm not allowed to read is skipped quietly instead of failing the whole search.
- **GUARD-10**  A scan gives up on an enormous folder rather than grinding through it forever.
- **GUARD-11**  The same refusals hold however let is reached, whether from a terminal, a tool call or a library.
