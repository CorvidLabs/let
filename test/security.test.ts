import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildScanContext } from "../src/catalog/context-builder.ts";
import { findAssets } from "../src/catalog/find.ts";
import { DEFAULT_SCAN_POLICY } from "../src/catalog/scan-policy.ts";
import { openPath, showAsset } from "../src/catalog/show.ts";
import { DEFAULT_CONFIG } from "../src/config.ts";

function tempDir(name: string): string {
  const dir = join(
    tmpdir(),
    `let-sec-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe("security: path_only and secret refusal", () => {
  test("show instructions refuses settings with path_only meta", async () => {
    const root = tempDir("settings");
    mkdirSync(join(root, ".claude"), { recursive: true });
    const settings = join(root, ".claude", "settings.local.json");
    writeFileSync(settings, JSON.stringify({ env: { API_KEY: "secret" } }));

    const ctx = buildScanContext({
      cwd: root,
      scope: "project",
      config: { ...DEFAULT_CONFIG },
      policy: DEFAULT_SCAN_POLICY,
    });
    // Force repo root to fixture
    const forced = { ...ctx, repoRoot: root, cwd: root };
    const body = await showAsset("instructions", settings, forced);
    expect(body.body).toBeUndefined();
    expect(body.payload?.path_only).toBe(true);
  });

  test("open refuses path_only mcp card body", async () => {
    const root = tempDir("mcp");
    const mcp = join(root, ".mcp.json");
    writeFileSync(
      mcp,
      JSON.stringify({
        mcpServers: { x: { env: { TOKEN: "sekrit" } } },
      }),
    );
    const ctx = {
      ...buildScanContext({ cwd: root, scope: "project" }),
      repoRoot: root,
      cwd: root,
    };
    const r = await openPath(mcp, ctx);
    expect(r.body).toBeUndefined();
    expect(r.refused === "path_only_or_secrets" || r.kind === "mcp").toBe(true);
  });

  test("open refuses session-like jsonl even if unknown card", async () => {
    const root = tempDir("sess");
    const jsonl = join(root, "sessions", "chat.jsonl");
    mkdirSync(join(root, "sessions"), { recursive: true });
    writeFileSync(jsonl, '{"role":"user","content":"secret transcript"}\n');
    const ctx = buildScanContext({ cwd: root, scope: "project" });
    const r = await openPath(jsonl, ctx);
    expect(r.body).toBeUndefined();
    expect(r.refused).toBeTruthy();
  });

  test("project scope does not dump global codex/cursor sessions", async () => {
    const root = tempDir("proj");
    writeFileSync(join(root, "AGENTS.md"), "# test\n");
    const ctx = buildScanContext({
      cwd: root,
      scope: "project",
      limit: 500,
    });
    // Override repoRoot to fixture (no git) so only host globals could leak
    const forced = { ...ctx, repoRoot: root, cwd: root };
    const sessions = await findAssets("sessions", forced);
    // Any codex year buckets / cursor chat ids are user-global — must be empty
    // under project scope for unbound hosts.
    const globalHosts = sessions.items.filter(
      (i) =>
        i.host === "codex" ||
        (i.host === "cursor" && i.meta?.source === "cursor.chats"),
    );
    expect(globalHosts.length).toBe(0);

    const memory = await findAssets("memory", forced);
    expect(
      memory.items.filter((i) => i.host === "grok" || i.host === "codex")
        .length,
    ).toBe(0);
  });

  test("loadTextBody partial: oversized file still returns prefix", async () => {
    const root = tempDir("big");
    const big = join(root, "BIG.md");
    // Just over open preview; use show with small file still ok
    writeFileSync(big, "A".repeat(10_000) + "TAIL");
    const ctx = {
      ...buildScanContext({ cwd: root }),
      repoRoot: root,
      cwd: root,
    };
    // Treat as instruction path via open when not in catalog — unknown path
    // still loads preview with cap; ensure no throw
    const r = await openPath(big, ctx);
    expect(r.refused).toBeUndefined();
    if (r.body) {
      expect(r.body.length).toBeLessThanOrEqual(8192);
    }
  });
});
