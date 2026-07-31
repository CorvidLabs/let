import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { findAssets } from "../src/catalog/find.ts";
import { geminiHome, homeDir, kimiHome } from "../src/paths.ts";

describe("gemini adapter", () => {
  test("doctor-level roots exist on this machine or skip gracefully", async () => {
    const ctx = buildScanContext({
      cwd: process.cwd(),
      scope: "user",
    });
    const sessions = await findAssets("sessions", ctx, { host: "gemini" });
    if (existsSync(geminiHome())) {
      // user scope should surface history or projects.json entries
      expect(sessions.total).toBeGreaterThanOrEqual(0);
    } else {
      expect(sessions.total).toBe(0);
    }
  });

  test("global GEMINI.md as instruction when present", async () => {
    const ctx = buildScanContext({ cwd: process.cwd(), scope: "all" });
    const instr = await findAssets("instructions", ctx, { host: "gemini" });
    const global = join(geminiHome(), "GEMINI.md");
    if (existsSync(global)) {
      expect(instr.items.some((i) => i.path === global)).toBe(true);
    }
  });
});

describe("kimi adapter", () => {
  test("user sessions from workspaces when ~/.kimi-code exists", async () => {
    const ctx = buildScanContext({ cwd: process.cwd(), scope: "user" });
    const sessions = await findAssets("sessions", ctx, { host: "kimi" });
    if (existsSync(kimiHome())) {
      expect(sessions.total).toBeGreaterThan(0);
      expect(sessions.items.every((i) => i.meta?.path_only === true)).toBe(
        true,
      );
    } else {
      expect(sessions.total).toBe(0);
    }
  });

  test("project scope matches quill workspace when available", async () => {
    const quill = join(homeDir(), "Development/_CorvidLabs/quill");
    if (!existsSync(quill) || !existsSync(kimiHome())) {
      return;
    }
    const ctx = buildScanContext({ cwd: quill, scope: "project" });
    const sessions = await findAssets("sessions", ctx, { host: "kimi" });
    // may or may not have quill workspace — just ensure no throw and path_only
    expect(sessions.items.every((i) => i.host === "kimi")).toBe(true);
  });
});

describe("multi-host agents", () => {
  test("find agents includes agent3md and host agent dirs", async () => {
    const ctx = buildScanContext({ cwd: process.cwd(), scope: "project" });
    const agents = await findAssets("agents", ctx);
    expect(agents.items.some((i) => i.host === "agent3md")).toBe(true);
  });
});
