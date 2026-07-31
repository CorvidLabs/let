import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScanContext } from "../src/adapters/types.ts";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { worktreeId } from "../src/catalog/ids.ts";
import { attributeHost, federateWorktrees } from "../src/catalog/merge.ts";
import { DEFAULT_SCAN_POLICY } from "../src/catalog/scan-policy.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

describe("worktreeId", () => {
  test("stable and host-free", () => {
    const a = worktreeId("/tmp/foo");
    const b = worktreeId("/tmp/foo");
    expect(a).toBe(b);
    expect(a.startsWith("worktrees:")).toBe(true);
    expect(a.includes("claude")).toBe(false);
  });
});

describe("attributeHost", () => {
  test("labels claude and project bases", () => {
    const repo = "/Users/leif/Development/_CorvidLabs/quill";
    const ctx: ScanContext = {
      cwd: repo,
      repoRoot: repo,
      repoCommonDir: join(repo, ".git"),
      home: tmpdir(),
      config: DEFAULT_CONFIG,
      scope: "project",
      policy: DEFAULT_SCAN_POLICY,
      limit: 100,
    };
    expect(attributeHost(join(repo, ".claude", "worktrees", "wf_1"), ctx)).toBe(
      "claude",
    );
    expect(attributeHost(join(repo, ".worktrees", "feat"), ctx)).toBe(
      "project",
    );
  });
});

describe("federateWorktrees local", () => {
  test("runs against this repo without throwing", () => {
    const ctx = buildScanContext({
      cwd: process.cwd(),
      scope: "project",
    });
    const { cards, total } = federateWorktrees(ctx);
    expect(total).toBeGreaterThanOrEqual(0);
    expect(cards.length).toBe(total > 100 ? 100 : total);
    // unique paths
    const paths = new Set(cards.map((c) => c.path));
    expect(paths.size).toBe(cards.length);
    // unique ids
    const ids = new Set(cards.map((c) => c.id));
    expect(ids.size).toBe(cards.length);
  });
});

describe("fixture host-only dir", () => {
  test("host-only worktree under .claude/worktrees is found", () => {
    const dir = mkdtempSync(join(tmpdir(), "let-wt-"));
    // init a mini git repo with a fake .claude/worktrees child
    Bun.spawnSync(["git", "init"], { cwd: dir });
    Bun.spawnSync(["git", "commit", "--allow-empty", "-m", "init"], {
      cwd: dir,
    });
    const wt = join(dir, ".claude", "worktrees", "agent-a");
    mkdirSync(wt, { recursive: true });
    writeFileSync(join(wt, "README"), "hi", "utf8");

    const ctx = buildScanContext({ cwd: dir, scope: "project" });
    const { cards } = federateWorktrees(ctx);
    const hit = cards.find((c) => c.path.includes("agent-a"));
    // may be host-only if not git-linked
    expect(hit?.host).toBe("claude");
  });
});
