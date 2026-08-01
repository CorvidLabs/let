import { describe, expect, test } from "bun:test";
import { runLet } from "../src/run.ts";
import { buildFleetSnapshot } from "../src/web.ts";

describe("web fleet snapshot", () => {
  test("is metadata-only and bounded", async () => {
    const snapshot = await buildFleetSnapshot(process.cwd(), Date.now());
    expect(snapshot.source).toBe("let");
    expect(snapshot.rows.length).toBeLessThanOrEqual(48);
    expect(snapshot.policy).toContain("No session transcripts");
    for (const row of snapshot.rows) {
      expect(JSON.stringify(row)).not.toContain("/Users/");
      expect(row.skills.length).toBeLessThanOrEqual(8);
      expect(row.instructions.length).toBeLessThanOrEqual(8);
    }
  });
});

test("web rejects an unsafe port before starting a server", async () => {
  const result = await runLet(["web", "--port", "not-a-port"]);
  expect(result.code).toBe(1);
  expect(result.text).toContain("--port must be an integer");
});
