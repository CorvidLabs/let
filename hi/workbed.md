---
hi: 1
families: [WORKBED]
---

# Your own working area

## Intent

Everything let finds belongs to somebody else. The workbed is the small patch that belongs to let: somewhere to make a worktree, keep a note, and write down a recipe of commands I keep repeating. It should always be optional, since discovery has to work perfectly well in a project that never sets one up. It should stay firmly inside its own boundaries, both when writing notes and when cleaning up worktrees.

## Criteria

- **WORKBED-1**  I can set up let's own working area in a project with one command.
  - **WORKBED-1.a**  Running that again leaves whatever is already there alone.
  - **WORKBED-1.b**  Local runtime clutter stays out of version control by default.
- **WORKBED-2**  Everything else works fine in a project that never sets one up.
- **WORKBED-3**  I can make a worktree for a piece of work with a name and branch I could have predicted.
  - **WORKBED-3.a**  Making one where a folder already exists stops rather than overwriting it.
  - **WORKBED-3.b**  A branch that already exists is checked out rather than treated as a failure.
- **WORKBED-4**  I can remove a worktree that let made.
  - **WORKBED-4.a**  A worktree another agent made is never let's to delete.
- **WORKBED-5**  I can save a small note under a name of my choosing.
- **WORKBED-6**  I can read a note back later by that name.
  - **WORKBED-6.a**  Asking for a note I never saved says not found.
- **WORKBED-7**  I can keep notes for just this project or for everything I do on this machine.
- **WORKBED-8**  Notes are only ever written inside let's own area.
- **WORKBED-9**  I can write down a short recipe of the commands I keep repeating.
  - **WORKBED-9.a**  I can start from a worked example instead of a blank file.
- **WORKBED-10**  I can list the recipes I've written down.
- **WORKBED-11**  I can see the settings let is running with.
  - **WORKBED-11.a**  Each setting says where it came from, so I know which file to change.
