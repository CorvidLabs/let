---
hi: 1
families: [FIND]
---

# Finding agent assets

## Intent

The whole product starts here: one command that answers what agent stuff exists for this project, across every coding agent installed on the machine. Assets stay where their host put them, so finding is a read over what already exists rather than a migration into somewhere new. Worktrees are the hardest case, because git and several agents all have an opinion about the same folder, and the answer has to be one entry per checkout. Searching should be cheap enough to run reflexively, and safe enough to run in a repository that has never heard of this tool.

## Criteria

- **FIND-1**  I can ask which worktrees exist for the project I'm standing in, whichever agent made them.
  - **FIND-1.a**  A checkout that both git and an agent's own folder know about appears once, not twice.
  - **FIND-1.b**  A worktree keeps the same identity even when let changes its mind about which agent owns it.
  - **FIND-1.c**  A worktree folder an agent made but git hasn't registered yet still shows up.
  - **FIND-1.d**  A folder that only looks like a checkout is listed without claiming a branch for it.
- **FIND-2**  The same command finds every kind of agent thing, so I never have to learn a different command per kind.
  - **FIND-2.a**  Asking for a kind that nothing on this machine provides gives me an empty list rather than an error.
- **FIND-3**  I can limit a search to a single agent when that's all I care about.
- **FIND-4**  I can narrow a search with a few words, matching names, descriptions and trigger phrases.
- **FIND-5**  By default I get what belongs to the project I'm standing in.
- **FIND-6**  I can deliberately widen a search to everything on this machine.
- **FIND-7**  Asking what skills I have here includes the ones installed globally, because that is what the question means.
- **FIND-8**  A long result is trimmed to a size I can actually read.
  - **FIND-8.a**  I can raise or lower that trim for a single search.
  - **FIND-8.b**  No search returns more than a fixed ceiling, however large a number I ask for.
- **FIND-9**  A trimmed result still tells me how many things there really were.
- **FIND-10**  Results arrive nearest first, so what belongs to this project sits above what merely exists on the machine.
- **FIND-11**  Two skills that share a name but come from different agents both stay in the list.
- **FIND-12**  Every result tells me where the thing actually lives, so I can go and open it myself.
- **FIND-13**  A search comes back fast enough that I'd run it before every task instead of guessing.
- **FIND-14**  Searching never changes anything on disk.
