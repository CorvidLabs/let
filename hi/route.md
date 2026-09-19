---
hi: 1
families: [ROUTE]
---

# Picking the right skill

## Intent

Nobody should have to grep a machine to find the skill they already installed. I describe the job in a sentence, and the skills most likely to do it come back ranked, each saying what it matched on and how to run it or read it. A skill that declares what it is for should beat one that merely happens to contain the word. No match at all should look like no match, not like a confident wrong answer.

## Criteria

- **ROUTE-1**  I can describe a job in plain words and get back the skills most likely to do it, best first.
- **ROUTE-2**  Each hit tells me which words it matched on.
- **ROUTE-3**  Each hit comes with the command that runs it.
- **ROUTE-4**  Each hit comes with the command that loads its full instructions.
- **ROUTE-5**  A skill that declares trigger phrases beats one that merely happens to contain the word.
- **ROUTE-6**  An agent's own idea of which of its skills fits wins over an outside guess.
- **ROUTE-7**  A request that matches nothing comes back empty rather than with a confident wrong answer.
- **ROUTE-8**  One common word buried in a long description doesn't push an unrelated skill to the top.
- **ROUTE-9**  I can limit routing to one agent's skills.
- **ROUTE-10**  Routing weighs every agent's skills at once, so the best one wins even when it belongs to an agent I'm not running.
