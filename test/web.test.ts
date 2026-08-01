import { describe, expect, test } from "bun:test";
import { runLet } from "../src/run.ts";
import {
  buildFleetSnapshot,
  fleetStateForSessions,
  fleetHtml,
  parseLocalAgentProcessLines,
} from "../src/web.ts";

describe("web fleet snapshot", () => {
  test("is metadata-only and bounded", async () => {
    const snapshot = await buildFleetSnapshot(process.cwd(), Date.now());
    expect(snapshot.source).toBe("let");
    expect(snapshot.liveProcessDetection).toBe("local-process");
    expect(JSON.stringify(snapshot.workingNow)).not.toContain("/Users/");
    expect(JSON.stringify(snapshot.workingNow)).not.toContain('"cwd"');
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

test("Fleet API and HTML never expose a process working directory", async () => {
  const api = JSON.stringify(await buildFleetSnapshot(process.cwd(), Date.now()));
  const page = fleetHtml();
  for (const response of [api, page]) {
    expect(response).not.toContain('"cwd"');
    expect(response).not.toContain("/Users/");
    expect(response).not.toContain("…/");
  }
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

test("only whitelisted local CLI processes become working agents", () => {
  const agents = parseLocalAgentProcessLines(
    "7 /opt/bin/grok\n8 /Applications/Codex\n9 /opt/bin/claude\n10 /bin/zsh",
    (pid) =>
      pid === "7" ? "/work/spec-sync" : pid === "9" ? "/work/let" : null,
  );
  expect(agents).toEqual([
    { agent: "Grok", cwd: "/work/spec-sync" },
    { agent: "Claude", cwd: "/work/let" },
  ]);
});

test("Codex and Cursor helpers require a project cwd", () => {
  const agents = parseLocalAgentProcessLines(
    "7 codex\n8 cursor\n9 grok",
    () => "/not-a-repository",
    () => false,
  );
  expect(agents).toEqual([{ agent: "Grok", cwd: "/not-a-repository" }]);
});
