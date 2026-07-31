import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { phraseHits, routeSkills, tokenize } from "../src/catalog/route.ts";

const root = join(import.meta.dir, "..");

describe("tokenize / phraseHits", () => {
  test("tokenizes unicode words", () => {
    expect(tokenize("Find Worktrees!")).toEqual(["find", "worktrees"]);
  });

  test("phrase requires all words", () => {
    const tokens = new Set(tokenize("find worktrees for this repo"));
    const { score, hits } = phraseHits(tokens, [
      "find worktrees",
      "memory",
      "worktrees",
    ]);
    expect(score).toBe(2);
    expect(hits).toContain("find worktrees");
    expect(hits).toContain("worktrees");
  });
});

describe("routeSkills dogfood", () => {
  test("routes worktree request to find-worktrees", async () => {
    const ctx = buildScanContext({ cwd: root });
    const r = await routeSkills("find worktrees for this repo", ctx, {
      host: "agent3md",
    });
    expect(r.hits.length).toBeGreaterThanOrEqual(1);
    expect(r.top?.skill.name).toBe("find-worktrees");
    expect(r.top?.source).toBe("agent3md");
    expect(r.top?.show).toContain("let show skill");
    expect(r.top?.tool).toContain("let find worktrees");
  });

  test("routes where am i", async () => {
    const ctx = buildScanContext({ cwd: root });
    const r = await routeSkills("where am i in this worktree", ctx, {
      host: "agent3md",
    });
    expect(r.top?.skill.name).toBe("where");
  });

  test("empty query returns no hits after trim handled by caller", async () => {
    const ctx = buildScanContext({ cwd: root });
    const r = await routeSkills("zzzznonexistentqueryxyz", ctx, {
      host: "agent3md",
    });
    expect(r.hits.length).toBe(0);
    expect(r.top).toBeUndefined();
  });

  test("does not rank host skills on single common description token", async () => {
    // Without --host agent3md, user/global skills are included. A query like
    // "find worktrees" must not top-rank a random skill that only contains "find"
    // in a long description (e.g. docx).
    const ctx = buildScanContext({ cwd: root, scope: "project", limit: 100 });
    const r = await routeSkills("find worktrees for this repo", ctx);
    expect(r.top?.skill.name).not.toBe("docx");
    // Prefer agent.3md when present in project
    if (r.top) {
      expect(
        r.top.source === "agent3md" || r.top.skill.name.includes("worktree"),
      ).toBe(true);
    }
  });
});
