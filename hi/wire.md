---
hi: 1
families: [WIRE]
---

# Using let from a program

## Intent

Most callers are agents rather than people, so every answer should be one predictable shape and every failure a reason a script can branch on. The same discovery should be reachable however a host prefers to reach it: as a command, as MCP tools, as a plugin of the project toolchain, or as a library import. Nothing about how it is called should change what it is willing to read.

## Criteria

- **WIRE-1**  Every command can answer in JSON.
  - **WIRE-1.a**  Nothing but the answer is ever printed where a caller is reading.
- **WIRE-2**  A person reading the terminal gets the answer without piping it through a JSON parser.
- **WIRE-3**  Success and failure arrive in the same outer shape, so a caller never has to guess how to read it.
- **WIRE-4**  A failure names its reason from a small fixed set instead of prose I'd have to pattern-match.
- **WIRE-5**  The exit status matches the kind of failure, so a script can branch on it.
- **WIRE-6**  An unexpected crash still comes back as a proper answer rather than a stack trace.
- **WIRE-7**  Every answer says which version of let produced it.
- **WIRE-8**  Every answer says how long the work took.
- **WIRE-9**  I can run let as an MCP server so any agent can use it as tools.
  - **WIRE-9.a**  Those tools only ever read, so nothing an agent does through them changes my machine.
  - **WIRE-9.b**  A tool that fails reports the failure as a result instead of breaking the connection.
  - **WIRE-9.c**  Those tools default to the project I'm in, not the whole machine.
- **WIRE-10**  I can install let into my project toolchain and call it like any other command there.
  - **WIRE-10.a**  Called that way, it works on the project the toolchain is pointed at without me repeating myself.
- **WIRE-11**  I can import let into my own program and call the same discovery directly.
- **WIRE-12**  Running let with nothing to do tells me what it can do.
