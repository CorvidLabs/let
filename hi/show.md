---
hi: 1
families: [SHOW]
---

# Reading one thing at a time

## Intent

Finding is cheap and reading is expensive, so the two stay separate on purpose. A search hands back cards, and the full text arrives only when something decides it wants that one thing. Names should be enough to ask with, ambiguity should be reported rather than resolved by coin flip, and anything let won't read should still say what it is and why it stopped.

## Criteria

- **SHOW-1**  A search hands me cards, never the full text of anything.
- **SHOW-2**  I can load one thing's full text when I decide I want it.
  - **SHOW-2.a**  Each card carries an identifier I can hand straight back to load that thing.
- **SHOW-3**  I can ask for a skill by its plain name instead of copying an identifier.
- **SHOW-4**  A name that two things share tells me which ones it could have meant instead of picking one.
  - **SHOW-4.a**  When exactly one of those matches sits inside the folder I'm standing in, that's the one I get.
- **SHOW-5**  Asking for something that isn't there says not found.
- **SHOW-6**  Loading an agent gives me the text that says who it is.
- **SHOW-7**  Loading an agent lists the skills it carries without dumping each one's body.
- **SHOW-8**  Loading a worktree tells me which branch it sits on.
  - **SHOW-8.a**  A worktree whose folder is gone from disk is reported as missing rather than looking live.
- **SHOW-9**  A file too large to hand over comes back as a capped opening section rather than not at all.
  - **SHOW-9.a**  A shortened body says plainly that it was cut short.
- **SHOW-10**  I can point at any file path and be told what kind of agent asset it is.
  - **SHOW-10.a**  Opening a path gives me a short preview rather than the whole file.
  - **SHOW-10.b**  A file let won't read still tells me what kind of file it is.
  - **SHOW-10.c**  A file let won't read tells me why it stopped.
- **SHOW-11**  Sessions, memory stores and task records come back as size and timestamp only.
