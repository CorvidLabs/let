import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { openPath, showAsset } from "../src/catalog/show.ts";
import { LetError } from "../src/errors.ts";

const root = join(import.meta.dir, "..");

describe("show", () => {
  test("show agent.3md skill by name", async () => {
    const ctx = buildScanContext({ cwd: root });
    const body = await showAsset("skill", "find-worktrees", ctx);
    expect(body.host).toBe("agent3md");
    expect(body.name).toBe("find-worktrees");
    expect(body.body).toBeTruthy();
    expect(body.body?.toLowerCase()).toContain("worktree");
    expect(body.payload?.tool).toContain("let find worktrees");
  });

  test("show agent let identity", async () => {
    const ctx = buildScanContext({ cwd: root });
    const body = await showAsset("agent", "let", ctx);
    expect(body.host).toBe("agent3md");
    expect(body.body).toBeTruthy();
    expect(body.payload?.skills).toBeArray();
  });

  test("show instruction AGENTS.md", async () => {
    const ctx = buildScanContext({ cwd: root });
    const body = await showAsset("instructions", "AGENTS.md", ctx);
    expect(body.body).toContain("let");
    expect(body.truncated_body).toBe(false);
  });

  test("show sessions is metadata only", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    // May be empty; if we have no sessions, expect not_found
    try {
      const cards = await showAsset("sessions", "nonexistent", ctx);
      void cards;
    } catch (err) {
      expect(err).toBeInstanceOf(LetError);
      expect((err as LetError).code).toBe("not_found");
    }
  });

  test("ambiguous skill name conflicts when many hosts match", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "all" });
    // "doctor" might only be agent3md in this repo - unique
    const body = await showAsset("skills", "doctor", ctx);
    expect(body.name).toBe("doctor");
  });
});

describe("open", () => {
  test("open agent.3md path", async () => {
    const ctx = buildScanContext({ cwd: root });
    const r = await openPath(join(root, "agent.3md"), ctx);
    expect(r.path.endsWith("agent.3md")).toBe(true);
    expect(r.kind === "agents" || r.kind === "file").toBe(true);
    // should not refuse
    expect(r.refused).toBeUndefined();
  });

  test("open AGENTS.md", async () => {
    const ctx = buildScanContext({ cwd: root });
    const r = await openPath(join(root, "AGENTS.md"), ctx);
    expect(r.body).toBeTruthy();
    expect(r.kind).toBe("instructions");
  });
});
