import { describe, expect, test } from "bun:test";
import { LET_VERSION } from "../src/envelope.ts";

/**
 * Smoke MCP protocol via a short-lived subprocess piping initialize + tools/list.
 */
describe("mcp serve", () => {
  test("initialize and tools/list over stdio", async () => {
    const root = new URL("..", import.meta.url).pathname;
    const proc = Bun.spawn(["bun", "run", "src/cli.ts", "mcp", "serve"], {
      cwd: root,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    const reqs = [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      },
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      },
    ];

    const payload = `${reqs.map((r) => JSON.stringify(r)).join("\n")}\n`;
    proc.stdin.write(payload);
    proc.stdin.end();

    const out = await new Response(proc.stdout).text();
    const code = await proc.exited;
    expect(code).toBe(0);

    const lines = out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map(
        (l) =>
          JSON.parse(l) as {
            id?: number;
            result?: Record<string, unknown>;
          },
      );

    const init = lines.find((l) => l.id === 1);
    expect(init?.result).toBeTruthy();
    const info = init?.result?.serverInfo as {
      name?: string;
      version?: string;
    };
    expect(info?.name).toBe("let");
    expect(info?.version).toBe(LET_VERSION);

    const tools = lines.find((l) => l.id === 2);
    const list = tools?.result?.tools as { name: string }[];
    expect(Array.isArray(list)).toBe(true);
    const names = list.map((t) => t.name);
    expect(names).toContain("let_find");
    expect(names).toContain("let_where");
    expect(names).toContain("let_history");
    expect(names).toContain("let_route");
  });
});
