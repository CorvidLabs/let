/**
 * Discover and index agent.3md / *.3md agents via @corvidlabs/agent3md.
 * Uses the canonical 3md parser inside that package.
 */

import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { Agent, validateAgent } from "@corvidlabs/agent3md";
import type { ScanContext } from "../adapters/types.ts";
import { isDirectory, mtimeMs, pathExists, readTextFile } from "../fs-scan.ts";
import { safeRealpath } from "../git.ts";
import { pathCardId, skillId } from "./ids.ts";
import type { IndexCard } from "./types.ts";

const CANDIDATE_NAMES = ["agent.3md", "Agent.3md"];

function listAgent3mdPaths(ctx: ScanContext): string[] {
  const roots = new Set<string>();
  if (ctx.repoRoot) {
    roots.add(safeRealpath(ctx.repoRoot) ?? ctx.repoRoot);
  }
  roots.add(safeRealpath(ctx.cwd) ?? ctx.cwd);

  const out: string[] = [];
  const seen = new Set<string>();

  const add = (p: string) => {
    const rp = safeRealpath(p) ?? p;
    if (seen.has(rp) || !pathExists(rp)) {
      return;
    }
    seen.add(rp);
    out.push(rp);
  };

  for (const root of roots) {
    for (const name of CANDIDATE_NAMES) {
      add(join(root, name));
    }
    if (isDirectory(root)) {
      try {
        for (const name of readdirSync(root).slice(
          0,
          ctx.policy.maxEntriesPerRoot,
        )) {
          if (name.endsWith(".3md")) {
            add(join(root, name));
          }
        }
      } catch {
        // skip
      }
    }
    const agentsDir = join(root, "agents");
    if (isDirectory(agentsDir)) {
      try {
        for (const name of readdirSync(agentsDir).slice(
          0,
          ctx.policy.maxEntriesPerRoot,
        )) {
          if (name.endsWith(".3md") || name === "agent.3md") {
            add(join(agentsDir, name));
          }
        }
      } catch {
        // skip
      }
    }
  }
  return out;
}

/** Cards for agent.3md agent documents (kind=agents). */
export function findAgent3mdAgents(ctx: ScanContext): IndexCard[] {
  const cards: IndexCard[] = [];
  for (const path of listAgent3mdPaths(ctx)) {
    const text = readTextFile(path, ctx.policy, 512_000);
    if (!text) {
      continue;
    }
    const report = validateAgent(text);
    let name = basename(path, ".3md");
    let description: string | undefined;
    if (report.ok) {
      try {
        const agent = new Agent(text);
        const m = agent.manifest();
        name = m.name || name;
        description = m.persona || undefined;
      } catch {
        // still emit path card
      }
    }
    cards.push({
      id: pathCardId("agents", path),
      kind: "agents",
      host: "agent3md",
      name,
      path,
      scope: "project",
      description,
      repo_root: ctx.repoRoot ?? undefined,
      mtime_ms: mtimeMs(path),
      meta: {
        format: "agent.3md",
        valid: report.ok,
        issues: report.ok ? 0 : report.errors.length,
      },
    });
  }
  return cards;
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
      for (const s of m.skills) {
        cards.push({
          id: skillId("agent3md", s.name, `${path}#${s.z}`),
          kind: "skills",
          host: "agent3md",
          name: s.name,
          path,
          scope: "project",
          description: s.tool
            ? `tool: ${s.tool}`
            : s.triggers.length
              ? `triggers: ${s.triggers.join(", ")}`
              : undefined,
          triggers: s.triggers,
          repo_root: ctx.repoRoot ?? undefined,
          mtime_ms: mtimeMs(path),
          meta: {
            format: "agent.3md",
            agent: m.name,
            z: s.z,
            tool: s.tool,
            cost: s.cost,
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
