import { describe, expect, test } from "bun:test";
import { runLet } from "../src/run.ts";
import { buildFleetSnapshot, fleetStateForSessions } from "../src/web.ts";

describe("web fleet snapshot", () => {
  test("is metadata-only and bounded", async () => {
    const snapshot = await buildFleetSnapshot(process.cwd(), Date.now());
    expect(snapshot.source).toBe("let");
    const repositories = [...snapshot.recentActivity, ...snapshot.history];
    expect(repositories.length).toBeLessThanOrEqual(48);
    expect(snapshot.policy).toContain("No session transcripts");
    for (const repository of repositories) {
      expect(JSON.stringify(repository)).not.toContain("/Users/");
      expect(repository.skills.length).toBeLessThanOrEqual(8);
      expect(repository.instructions.length).toBeLessThanOrEqual(8);
      expect(repository.worktrees.length).toBeGreaterThan(0);
    }
  });
});

test("stale session history never appears as recent activity", () => {
  expect(
    fleetStateForSessions([
      {
        provider: "grok",
        name: "old",
        freshness: "stale",
        activity: "20h ago",
      },
    ]),
  ).toBe("history");
  expect(
    fleetStateForSessions([
      {
        provider: "grok",
        name: "new",
        freshness: "live",
        activity: "Just now",
      },
      {
        provider: "codex",
        name: "old",
        freshness: "stale",
        activity: "20h ago",
      },
    ]),
  ).toBe("recent");
});

test("web rejects an unsafe port before starting a server", async () => {
  const result = await runLet(["web", "--port", "not-a-port"]);
  expect(result.code).toBe(1);
  expect(result.text).toContain("--port must be an integer");
});
