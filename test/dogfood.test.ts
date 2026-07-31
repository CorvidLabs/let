import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { findAssets } from "../src/catalog/find.ts";
import { whereAmI } from "../src/catalog/where.ts";

const root = join(import.meta.dir, "..");

describe("dogfood: let discovers itself", () => {
  test("finds AGENTS.md / CLAUDE.md instructions", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    const r = await findAssets("instructions", ctx);
    const names = r.items.map((i) => i.name);
    expect(names).toContain("AGENTS.md");
    expect(names).toContain("CLAUDE.md");
  });

  test("finds agent.3md as agent3md agent", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    const r = await findAssets("agents", ctx);
    const a3 = r.items.filter((i) => i.host === "agent3md");
    expect(a3.length).toBeGreaterThanOrEqual(1);
    expect(a3.some((i) => i.path.endsWith("agent.3md"))).toBe(true);
    expect(a3.some((i) => i.meta?.valid === true)).toBe(true);
  });

  test("finds agent.3md skill planes", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    const r = await findAssets("skills", ctx, { host: "agent3md" });
    expect(r.items.length).toBeGreaterThanOrEqual(3);
    const names = r.items.map((i) => i.name);
    expect(names).toContain("find-worktrees");
    expect(names).toContain("where");
    expect(names).toContain("doctor");
  });

  test("where . sees instructions", () => {
    const ctx = buildScanContext({ cwd: root });
    const w = whereAmI(ctx);
    expect(w.related.instructions.length).toBeGreaterThanOrEqual(1);
    expect(w.related.sessions).toEqual([]);
  });

  test("show loads agent.3md skill body", async () => {
    const { showAsset } = await import("../src/catalog/show.ts");
    const ctx = buildScanContext({ cwd: root });
    const body = await showAsset("skill", "where", ctx);
    expect(body.body).toBeTruthy();
    expect(body.host).toBe("agent3md");
  });

  test("route ranks agent.3md skills", async () => {
    const { routeSkills } = await import("../src/catalog/route.ts");
    const ctx = buildScanContext({ cwd: root });
    const r = await routeSkills("diagnose doctor health", ctx, {
      host: "agent3md",
    });
    expect(r.top?.skill.name).toBe("doctor");
  });
});
