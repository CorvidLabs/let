/**
 * Discover and index agent.3md / *.3md agents via @corvidlabs/agent3md.
 * The let standard treats 3md agent documents as first-class federated agents:
 * identity plane + skill planes, progressive disclosure via show/route.
 */

import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Agent, validateAgent } from "@corvidlabs/agent3md";
import type { ScanContext } from "../adapters/types.ts";
import { isDirectory, mtimeMs, pathExists, readTextFile } from "../fs-scan.ts";
import { safeRealpath } from "../git.ts";
import { homeDir, projectLetDir } from "../paths.ts";
import { pathCardId, skillId } from "./ids.ts";
import { wantProject, wantUser } from "./scope.ts";
import type { IndexCard } from "./types.ts";

const CANDIDATE_NAMES = ["agent.3md", "Agent.3md"];

function addPath(out: string[], seen: Set<string>, p: string): void {
  const rp = safeRealpath(p) ?? p;
  if (seen.has(rp) || !pathExists(rp)) {
    return;
  }
  seen.add(rp);
  out.push(rp);
}

function scanDirFor3md(
  dir: string,
  out: string[],
  seen: Set<string>,
  max: number,
): void {
  if (!isDirectory(dir)) {
    return;
  }
  try {
    for (const name of readdirSync(dir).slice(0, max)) {
      if (
        name.endsWith(".3md") ||
        name === "agent.3md" ||
        name === "Agent.3md"
      ) {
        addPath(out, seen, join(dir, name));
      }
    }
  } catch {
    // skip
  }
}

/**
 * Roots for agent.3md / *.3md discovery (let standard):
 * - repo root + cwd: agent.3md, *.3md, agents/*.3md
 * - project: .let/agents, agents/
 * - user: ~/.let/agents, ~/.claude/agents (*.3md only), ~/.codex/agents
 */
function listAgent3mdPaths(ctx: ScanContext): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const max = ctx.policy.maxEntriesPerRoot;

  const projectRoots = new Set<string>();
  if (wantProject(ctx)) {
    if (ctx.repoRoot) {
      projectRoots.add(safeRealpath(ctx.repoRoot) ?? ctx.repoRoot);
    }
    projectRoots.add(safeRealpath(ctx.cwd) ?? ctx.cwd);
  }

  for (const root of projectRoots) {
    for (const name of CANDIDATE_NAMES) {
      addPath(out, seen, join(root, name));
    }
    scanDirFor3md(root, out, seen, max);
    scanDirFor3md(join(root, "agents"), out, seen, max);
    scanDirFor3md(join(root, ".let", "agents"), out, seen, max);
    if (ctx.repoRoot) {
      scanDirFor3md(
        join(projectLetDir(ctx.repoRoot), "agents"),
        out,
        seen,
        max,
      );
    }
  }

  if (wantUser(ctx)) {
    const userRoots = [
      join(homeDir(), ".let", "agents"),
      join(homeDir(), ".claude", "agents"),
      join(homeDir(), ".codex", "agents"),
      join(homeDir(), ".cursor", "agents"),
      join(homeDir(), ".grok", "agents"),
      join(homeDir(), ".grok", "bundled", "agents"),
    ];
    for (const dir of userRoots) {
      scanDirFor3md(dir, out, seen, max);
    }
    // optional user-global agent.3md
    addPath(out, seen, join(homeDir(), ".let", "agent.3md"));
    addPath(out, seen, join(homeDir(), "agent.3md"));
  }

  return out;
}

function agentCardFromPath(path: string, ctx: ScanContext): IndexCard {
  const text = readTextFile(path, ctx.policy, 512_000);
  let name = basename(path, ".3md");
  let description: string | undefined;
  let valid = false;
  let issues = 0;
  let skillCount = 0;
  let model: string | undefined;
  let tools: string[] | undefined;

  if (text) {
    const report = validateAgent(text);
    valid = report.ok;
    issues = report.ok ? 0 : report.errors.length;
    if (report.ok) {
      try {
        const agent = new Agent(text);
        const m = agent.manifest();
        name = m.name || name;
        description = m.persona || undefined;
        skillCount = m.skills.length;
        model = m.model ?? undefined;
        tools = m.tools;
      } catch {
        // still emit path card
      }
    }
  }

  const underRepo = Boolean(ctx.repoRoot && path.startsWith(ctx.repoRoot));
  return {
    id: pathCardId("agents", path),
    kind: "agents",
    host: "agent3md",
    name,
    path,
    scope: underRepo ? "project" : "user",
    description,
    repo_root: underRepo ? (ctx.repoRoot ?? undefined) : undefined,
    mtime_ms: mtimeMs(path),
    meta: {
      format: "agent.3md",
      standard: "let",
      valid,
      issues,
      skill_count: skillCount,
      model,
      tools,
    },
  };
}

/** Cards for agent.3md agent documents (kind=agents). */
export function findAgent3mdAgents(ctx: ScanContext): IndexCard[] {
  return listAgent3mdPaths(ctx).map((path) => agentCardFromPath(path, ctx));
}

/** Skill planes from agent.3md files as progressive skill cards. */
export function findAgent3mdSkills(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  for (const path of listAgent3mdPaths(ctx)) {
    const text = readTextFile(path, ctx.policy, 512_000);
    if (!text) {
      continue;
    }
    try {
      const agent = new Agent(text);
      const m = agent.manifest();
      const underRepo = Boolean(ctx.repoRoot && path.startsWith(ctx.repoRoot));
      for (const s of m.skills) {
        cards.push({
          id: skillId("agent3md", s.name, `${path}#${s.z}`),
          kind: "skills",
          host: "agent3md",
          name: s.name,
          path,
          scope: underRepo ? "project" : "user",
          description: s.tool
            ? `tool: ${s.tool}`
            : s.triggers.length
              ? `triggers: ${s.triggers.join(", ")}`
              : undefined,
          triggers: s.triggers,
          repo_root: underRepo ? (ctx.repoRoot ?? undefined) : undefined,
          mtime_ms: mtimeMs(path),
          meta: {
            format: "agent.3md",
            standard: "let",
            agent: m.name,
            z: s.z,
            tool: s.tool,
            cost: s.cost,
            inputs: s.inputs,
            progressive: true,
          },
        });
      }
    } catch {
      // invalid file: skip skills (agent card still available via find agents)
    }
  }
  return cards;
}

/**
 * List all discovered agent.3md paths (for open/classify).
 * Exported for tests and openPath.
 */
export function listAgent3mdFiles(ctx: ScanContext): string[] {
  return listAgent3mdPaths(ctx);
}
