/**
 * Federate skills from project + user catalogs.
 */

import { basename, join } from "node:path";
import type { ScanContext } from "../adapters/types.ts";
import {
  isDirectory,
  listChildPaths,
  mtimeMs,
  parseSkillFrontmatter,
  pathExists,
  readTextFile,
} from "../fs-scan.ts";
import { skillId } from "./ids.ts";
import { skillRoots } from "./scan-policy.ts";
import type { HostId, IndexCard } from "./types.ts";

function hostForSkillRoot(root: string, ctx: ScanContext): HostId {
  if (root.includes("/.claude/") || root.endsWith("/.claude/skills")) {
    return "claude";
  }
  if (root.includes("/.grok/")) {
    return "grok";
  }
  if (root.includes("/.cursor/") || root.includes("skills-cursor")) {
    return "cursor";
  }
  if (ctx.repoRoot && root.startsWith(ctx.repoRoot)) {
    return "project";
  }
  return "unknown";
}

function cardFromSkillPath(
  skillPath: string,
  host: HostId,
  ctx: ScanContext,
  underRepo: boolean,
): IndexCard | null {
  // skillPath may be a dir with SKILL.md or a lone .md file
  let bodyPath = skillPath;
  let name = basename(skillPath);
  if (isDirectory(skillPath)) {
    const md = join(skillPath, "SKILL.md");
    if (!pathExists(md)) {
      // try any .md
      return null;
    }
    bodyPath = md;
  } else if (!skillPath.endsWith(".md")) {
    return null;
  } else {
    name = basename(skillPath, ".md");
  }

  const text = readTextFile(bodyPath, ctx.policy, 64_000);
  const fm = text ? parseSkillFrontmatter(text) : {};
  if (fm.name) {
    name = fm.name;
  }

  return {
    id: skillId(host, name, bodyPath),
    kind: "skills",
    host,
    name,
    path: bodyPath,
    scope: underRepo ? "project" : "user",
    description: fm.description,
    repo_root: underRepo ? (ctx.repoRoot ?? undefined) : undefined,
    mtime_ms: mtimeMs(bodyPath),
    meta: { skill_dir: isDirectory(skillPath) ? skillPath : undefined },
  };
}

export function findSkills(ctx: ScanContext): {
  cards: IndexCard[];
  total: number;
  truncated: boolean;
} {
  const roots = skillRoots(ctx.repoRoot);
  const wantProject =
    ctx.scope === "project" || ctx.scope === "all";
  const wantUser =
    ctx.scope === "user" ||
    ctx.scope === "all" ||
    (ctx.scope === "project" && ctx.config.find.include_user_skills);

  const cards: IndexCard[] = [];
  const seen = new Set<string>();

  const scanRoot = (root: string, underRepo: boolean) => {
    if (!pathExists(root)) {
      return;
    }
    const host = hostForSkillRoot(root, ctx);
    if (isDirectory(root)) {
      // children: skill dirs or .md files
      const children = listChildPaths(root, ctx.policy, { directoriesOnly: false });
      for (const child of children) {
        const card = cardFromSkillPath(child, host, ctx, underRepo);
        if (card && !seen.has(card.id)) {
          seen.add(card.id);
          cards.push(card);
        }
      }
      // also SKILL.md directly? unusual
      const direct = join(root, "SKILL.md");
      if (pathExists(direct)) {
        const card = cardFromSkillPath(root, host, ctx, underRepo);
        if (card && !seen.has(card.id)) {
          seen.add(card.id);
          cards.push(card);
        }
      }
    }
  };

  if (wantProject) {
    for (const r of roots.project) {
      scanRoot(r, true);
    }
  }
  if (wantUser) {
    for (const r of roots.user) {
      scanRoot(r, false);
    }
  }

  cards.sort((a, b) => {
    const aLocal = a.scope === "project" ? 0 : 1;
    const bLocal = b.scope === "project" ? 0 : 1;
    if (aLocal !== bLocal) {
      return aLocal - bLocal;
    }
    if (a.host !== b.host) {
      return a.host.localeCompare(b.host);
    }
    return a.name.localeCompare(b.name);
  });

  const total = cards.length;
  const truncated = total > ctx.limit;
  return {
    cards: truncated ? cards.slice(0, ctx.limit) : cards,
    total,
    truncated,
  };
}
