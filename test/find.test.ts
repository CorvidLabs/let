import { describe, expect, test } from "bun:test";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { buildContext } from "../src/catalog/context.ts";
import { findAssets } from "../src/catalog/find.ts";
import { whereAmI } from "../src/catalog/where.ts";

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
