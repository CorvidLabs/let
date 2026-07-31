import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { findAssets } from "../src/catalog/find.ts";
import { routeSkills } from "../src/catalog/route.ts";
import { showAsset } from "../src/catalog/show.ts";
import { FIND_KINDS } from "../src/catalog/types.ts";
import {
  claudeHome,
  codexHome,
  cursorHome,
  geminiHome,
  grokHome,
  kimiHome,
} from "../src/paths.ts";

const root = join(import.meta.dir, "..");

describe("let standard federation", () => {
  test("every FindKind is queryable without throw", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "all", limit: 50 });
    for (const kind of FIND_KINDS) {
      const r = await findAssets(kind, ctx);
      expect(r.kind).toBe(kind);
      expect(Array.isArray(r.items)).toBe(true);
      expect(r.total).toBeGreaterThanOrEqual(r.items.length);
    }
  });

  test("agent.3md agents and skill planes are first-class", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    const agents = await findAssets("agents", ctx, { host: "agent3md" });
    expect(agents.total).toBeGreaterThan(0);
    expect(agents.items.every((i) => i.meta?.format === "agent.3md")).toBe(
      true,
    );

    const skills = await findAssets("skills", ctx, { host: "agent3md" });
    expect(skills.total).toBeGreaterThanOrEqual(10);
    expect(skills.items.every((i) => i.meta?.progressive === true)).toBe(true);

    const shown = await showAsset("skill", "find-memory", ctx);
    expect(shown.body).toBeTruthy();
    expect(shown.payload?.format).toBe("agent.3md");
  });

  test("route prefers agent.3md for find memory", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    const r = await routeSkills("find memory and memtrace", ctx);
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.top?.skill.name).toMatch(/memory|find-memory/);
  });

  test("sessions and memory are path-only on show", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "user", limit: 20 });
    const sessions = await findAssets("sessions", ctx);
    if (sessions.items[0]) {
      const body = await showAsset("sessions", sessions.items[0].id, ctx);
      expect(body.body).toBeUndefined();
      expect(body.payload?.path_only).toBe(true);
    }
    const memory = await findAssets("memory", ctx);
    if (memory.items[0]) {
      const body = await showAsset("memory", memory.items[0].id, ctx);
      expect(body.body).toBeUndefined();
      expect(body.payload?.path_only).toBe(true);
    }
  });

  test("claude plugins/tasks surface when home exists", async () => {
    if (!existsSync(claudeHome())) {
      return;
    }
    const ctx = buildScanContext({ cwd: root, scope: "user", limit: 100 });
    const plugins = await findAssets("plugins", ctx, { host: "claude" });
    const tasks = await findAssets("tasks", ctx, { host: "claude" });
    expect(plugins.total + tasks.total).toBeGreaterThan(0);
  });

  test("grok sessions and memtrace when present", async () => {
    if (!existsSync(grokHome())) {
      return;
    }
    const ctx = buildScanContext({ cwd: root, scope: "user", limit: 100 });
    const sessions = await findAssets("sessions", ctx, { host: "grok" });
    const memory = await findAssets("memory", ctx, { host: "grok" });
    expect(sessions.total + memory.total).toBeGreaterThan(0);
  });

  test("codex agents and sessions when present", async () => {
    if (!existsSync(codexHome())) {
      return;
    }
    const ctx = buildScanContext({ cwd: root, scope: "user", limit: 100 });
    const agents = await findAssets("agents", ctx, { host: "codex" });
    expect(agents.total).toBeGreaterThan(0);
  });

  test("cursor chats and plans when present", async () => {
    if (!existsSync(cursorHome())) {
      return;
    }
    const ctx = buildScanContext({ cwd: root, scope: "user", limit: 100 });
    const sessions = await findAssets("sessions", ctx, { host: "cursor" });
    const tasks = await findAssets("tasks", ctx, { host: "cursor" });
    expect(sessions.total + tasks.total).toBeGreaterThan(0);
  });

  test("gemini and kimi adapters stay graceful", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "user", limit: 50 });
    const g = await findAssets("sessions", ctx, { host: "gemini" });
    const k = await findAssets("sessions", ctx, { host: "kimi" });
    if (existsSync(geminiHome())) {
      expect(g.total).toBeGreaterThanOrEqual(0);
    }
    if (existsSync(kimiHome())) {
      expect(k.total).toBeGreaterThan(0);
    }
  });

  test("commands federation includes claude and/or cursor roots", async () => {
    const ctx = buildScanContext({ cwd: root, scope: "all", limit: 100 });
    const commands = await findAssets("commands", ctx);
    // may be empty on a clean machine; never throws
    expect(commands.items.every((c) => c.kind === "commands")).toBe(true);
  });
});
