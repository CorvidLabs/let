---
hi: 1
families: [ORIENT]
---

# Knowing where you are

## Intent

An agent that wakes up in a folder needs to know what that folder is before it does anything else. Standing in a checkout somewhere under an agent's home, I should be told which agent made it, which branch it's on, what the real project is, what else belongs to that project, and which instruction files apply. There should also be a way to hand a fresh agent a starter pack of that context in one call, small enough to paste into a prompt. That pack should never quietly include somebody's chat history.

## Criteria

- **ORIENT-1**  I can ask what the folder I'm standing in actually is.
  - **ORIENT-1.a**  Asking about a path that isn't there says so rather than inventing an answer.
  - **ORIENT-1.b**  Standing somewhere that is no project at all, I'm told that plainly rather than handed a wrong project.
- **ORIENT-2**  Standing inside an agent's worktree, I'm told which agent made it.
- **ORIENT-3**  Standing inside a worktree, I'm told which branch it's on.
- **ORIENT-4**  Standing in a worktree, the project I'm told about is the parent repository, not the worktree itself.
- **ORIENT-5**  I'm shown the other worktrees that belong to the same project.
- **ORIENT-6**  I'm shown the instruction files that apply where I'm standing.
- **ORIENT-7**  Instruction files come back general first and closest to me last, so the most specific rules land on top.
- **ORIENT-8**  I can ask about a path other than the one I'm standing in.
- **ORIENT-9**  I can get a starter pack of project context in one call, small enough to hand straight to an agent.
  - **ORIENT-9.a**  I can ask for a fuller pack that includes the instruction text itself.
  - **ORIENT-9.b**  A fuller pack is capped so it can't swamp a context window.
- **ORIENT-10**  A context pack never includes sessions or transcripts, however I ask for it.
