import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { buildHistory } from "../src/catalog/history.ts";
import { runLet } from "../src/run.ts";
import { initLetWorkbed } from "../src/workbed/init.ts";
import { memoryGet, memoryList, memorySet } from "../src/workbed/memory.ts";
import {
  listSuperskills,
  writeExampleSuperskill,
} from "../src/workbed/superskill.ts";

describe("history", () => {
  test("buildHistory returns path_only host ranking", async () => {
    const ctx = buildScanContext({
      cwd: process.cwd(),
      scope: "user",
      limit: 50,
    });
    const h = await buildHistory(ctx);
    expect(h.path_only).toBe(true);
    expect(Array.isArray(h.hosts)).toBe(true);
    expect(h.totals.session_cards).toBeGreaterThanOrEqual(0);
  });
});

describe("workbed", () => {
  test("init + memory + superskill example", () => {
    const root = mkdtempSync(join(tmpdir(), "let-wb-"));
    try {
      // fake git root not required for memory project if we pass root
      const init = initLetWorkbed(root);
      expect(init.created.length).toBeGreaterThan(0);
      expect(init.let_dir.endsWith(".let")).toBe(true);

      memorySet("hello", { n: 1 }, "project", root);
      const got = memoryGet("hello", "project", root);
      expect(got.value).toEqual({ n: 1 });
      expect(memoryList("project", root).length).toBe(1);

      const ex = writeExampleSuperskill(root);
      expect(ex.name).toBe("example-locate");
      expect(listSuperskills("project", root).length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("cli surface", () => {
  test("history --json", async () => {
    const r = await runLet([
      "history",
      "--scope",
      "user",
      "--limit",
      "20",
      "--json",
    ]);
    expect(r.code).toBe(0);
    expect(r.envelope?.ok).toBe(true);
    const data = r.envelope?.data as { path_only?: boolean };
    expect(data.path_only).toBe(true);
  });

  test("config show", async () => {
    const r = await runLet(["config", "show", "--json"]);
    expect(r.code).toBe(0);
    expect(r.envelope?.ok).toBe(true);
  });

  test("skill list", async () => {
    const r = await runLet(["skill", "list", "--host", "agent3md", "--json"]);
    expect(r.code).toBe(0);
    expect(r.envelope?.ok).toBe(true);
  });
});
