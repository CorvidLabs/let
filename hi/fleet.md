---
hi: 1
families: [FLEET]
---

# Watching the fleet

## Intent

A local page that answers what my agents are doing right now: which are working, in which project and worktree, and on what. It should be built from what let already indexed plus a look at which agent processes are really running, so working now means a live process and never a warm timestamp. It watches and nothing more, so no button on the page starts, stops or steers anything. Nothing secret-shaped should reach the browser, and anything let can't work out should be labelled unavailable rather than guessed at.

## Criteria

- **FLEET-1**  I can start a local page that shows what my agents are doing.
- **FLEET-2**  The page is reachable only from this machine.
  - **FLEET-2.a**  I can put it on a different port.
  - **FLEET-2.b**  A port that isn't a real port is refused before anything starts listening.
- **FLEET-3**  Agents come first and projects second, because I'm usually asking about an agent.
- **FLEET-4**  An agent shown as working now really has a process running.
- **FLEET-5**  An old session is never dressed up as a live agent.
- **FLEET-6**  Each working agent shows where it's working: which project, which worktree, which branch.
- **FLEET-7**  An agent that can't be matched to a project is shown as unassigned rather than hidden.
- **FLEET-8**  I can expand an agent to see what it was last asked to do.
- **FLEET-9**  I can see a recent slice of an agent's output without going and opening its files myself.
- **FLEET-10**  Anything shaped like a token, a password or a local path is masked before it reaches the page.
- **FLEET-11**  Detail let can't get is labelled unavailable rather than guessed at.
- **FLEET-12**  No button on the page can start, stop or steer anything.
- **FLEET-13**  The page keeps itself up to date without me reloading.
  - **FLEET-13.a**  A refresh doesn't lose the panel I had open or where I'd scrolled.
- **FLEET-14**  When an agent starts working or first appears, a screen reader is told about it.
  - **FLEET-14.a**  An announcement never steals the focus I was using.
- **FLEET-15**  I can see whether the worktree an agent is in has uncommitted work.
- **FLEET-16**  Every list on the page is capped so a busy machine still renders.
