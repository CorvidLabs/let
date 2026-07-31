/**
 * `let init` — bootstrap optional .let workbed dirs (never required for find).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathExists } from "../fs-scan.ts";
import { projectLetDir } from "../paths.ts";

export type InitResult = {
  repo_root: string;
  let_dir: string;
  created: string[];
  existed: string[];
  wrote_gitignore: boolean;
};

const SUBDIRS = [
  "worktrees",
  "memory",
  "sessions",
  "superskills",
  "workflows",
  "agents",
  "handoffs",
  "loops",
] as const;

export function initLetWorkbed(repoRoot: string): InitResult {
  const letDir = projectLetDir(repoRoot);
  const created: string[] = [];
  const existed: string[] = [];

  if (!pathExists(letDir)) {
    mkdirSync(letDir, { recursive: true });
    created.push(letDir);
  } else {
    existed.push(letDir);
  }

  for (const sub of SUBDIRS) {
    const p = join(letDir, sub);
    if (!pathExists(p)) {
      mkdirSync(p, { recursive: true });
      created.push(p);
    } else {
      existed.push(p);
    }
  }

  let wrote_gitignore = false;
  const gi = join(letDir, ".gitignore");
  if (!pathExists(gi)) {
    writeFileSync(
      gi,
      `# let workbed — keep local runtime local
sessions/
memory/
handoffs/
loops/
worktrees/
*.local.*
`,
      "utf8",
    );
    wrote_gitignore = true;
    created.push(gi);
  }

  const readme = join(letDir, "README.md");
  if (!pathExists(readme)) {
    writeFileSync(
      readme,
      `# .let workbed

Optional write target for \`let\`. Discovery still federates host paths in place.

- \`worktrees/\` — \`let worktree add\`
- \`memory/\` — \`let memory set|get|list\`
- \`superskills/\` — TOML superskills
- \`workflows/\` — workflow defs
- \`agents/\` — optional \`*.3md\` agents

See \`let help\` and docs/usage.md.
`,
      "utf8",
    );
    created.push(readme);
  }

  return {
    repo_root: repoRoot,
    let_dir: letDir,
    created,
    existed,
    wrote_gitignore,
  };
}
