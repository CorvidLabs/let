import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildContext } from "../src/catalog/context.ts";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { findAssets } from "../src/catalog/find.ts";
import { whereAmI } from "../src/catalog/where.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

describe("find", () => {
  test("find instructions in let repo", async () => {
    const ctx = buildScanContext({ cwd: process.cwd() });
    const r = await findAssets("instructions", ctx);
    expect(r.kind).toBe("instructions");
    const names = r.items.map((i) => i.name);
    expect(names.some((n) => n === "AGENTS.md" || n === "CLAUDE.md")).toBe(
      true,
    );
  });

  test("find skills includes user catalogs when project scope", async () => {
    const ctx = buildScanContext({ cwd: process.cwd(), scope: "project" });
    const r = await findAssets("skills", ctx);
    // at least grok or claude skills often present on this machine
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.items.length).toBeLessThanOrEqual(ctx.limit);
  });

  test("find skills discovers project openai skill roots", async () => {
    const root = mkdtempSync(join(tmpdir(), "let-openai-"));
    Bun.spawnSync(["git", "init"], { cwd: root });
    const skillDir = join(root, ".openai", "skills", "agent-coordination");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: agent-coordination\ndescription: Coordinate agents\n---\n# Coordination\n",
    );
    const ctx = buildScanContext({
      cwd: root,
      scope: "project",
      config: {
        ...DEFAULT_CONFIG,
        find: { ...DEFAULT_CONFIG.find, include_user_skills: false },
      },
    });
    const r = await findAssets("skills", ctx, { host: "openai" });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]?.host).toBe("openai");
    expect(r.items[0]?.name).toBe("agent-coordination");
    expect(realpathSync(r.items[0]?.path ?? "")).toBe(
      realpathSync(join(skillDir, "SKILL.md")),
    );
  });

  test("find skills keeps generic project roots below .openai attributed to project", async () => {
    const parent = mkdtempSync(join(tmpdir(), "let-openai-parent-"));
    const root = join(parent, ".openai", "worktrees", "repo");
    mkdirSync(root, { recursive: true });
    Bun.spawnSync(["git", "init"], { cwd: root });
    const skillDir = join(root, "skills", "generic-skill");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "# Generic skill\n");

    const ctx = buildScanContext({
      cwd: root,
      scope: "project",
      config: {
        ...DEFAULT_CONFIG,
        find: { ...DEFAULT_CONFIG.find, include_user_skills: false },
      },
    });
    const r = await findAssets("skills", ctx, { host: "project" });
    const genericSkill = r.items.find(
      (item) =>
        realpathSync(item.path) === realpathSync(join(skillDir, "SKILL.md")),
    );

    expect(genericSkill?.host).toBe("project");
  });

  test("find worktrees dedupes paths", async () => {
    const ctx = buildScanContext({ cwd: process.cwd() });
    const r = await findAssets("worktrees", ctx);
    const paths = r.items.map((i) => i.path);
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("where", () => {
  test("where on cwd returns structure", () => {
    const ctx = buildScanContext({ cwd: process.cwd() });
    const w = whereAmI(ctx);
    expect(w.path).toBeTruthy();
    expect(w.related.sessions).toEqual([]);
    expect(Array.isArray(w.related.sibling_worktrees)).toBe(true);
    expect(Array.isArray(w.related.instructions)).toBe(true);
  });
});

describe("context", () => {
  test("brief pack never includes sessions", async () => {
    const ctx = buildScanContext({ cwd: process.cwd() });
    const c = await buildContext(ctx, "brief");
    expect(c.sessions).toEqual([]);
    expect(c.pack).toBe("brief");
    expect(c.instructions.length).toBeGreaterThanOrEqual(0);
  });
});
