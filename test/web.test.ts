import { describe, expect, test } from "bun:test";
import { runLet } from "../src/run.ts";
import {
  buildFleetSnapshot,
  fleetHtml,
  fleetStateForSessions,
  parseLocalAgentProcessLines,
  redactLocalDetail,
  selectAgentWorkContext,
} from "../src/web.ts";

describe("web fleet snapshot", () => {
  test("is metadata-only and bounded", async () => {
    const snapshot = await buildFleetSnapshot(process.cwd(), Date.now());
    expect(snapshot.source).toBe("let");
    expect(snapshot.liveProcessDetection).toBe("local-process");
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

test("Fleet API and HTML expose local supervision details without internal CWD keys", async () => {
  const api = JSON.stringify(
    await buildFleetSnapshot(process.cwd(), Date.now()),
  );
  const page = fleetHtml();
  for (const response of [api, page]) {
    expect(response).not.toContain('"cwd"');
    expect(response).not.toContain('"pid"');
  }
  expect(page).toContain("Local-only supervisor view");
  expect(page).toContain("Latest prompt or status");
});

test("local supervisor details redact known secret-shaped values", () => {
  const detail = redactLocalDetail(
    "token=ghp_abcdefghijklmnopqrstuvwxyz123456 password=private-value",
  );
  expect(detail).toContain("token=[REDACTED]");
  expect(detail).toContain("password=[REDACTED]");
  expect(detail).not.toContain("private-value");
});

test("Fleet page starts by agent and keeps project worktrees collapsed", () => {
  const page = fleetHtml();
  expect(page).toContain('data-view="agents"');
  expect(page).toContain("By agent");
  expect(page).toContain("By project");
  expect(page).toContain("Unassigned running agent");
  expect(page).toContain('<details class="card">');
  expect(page).not.toContain('<details class="card" open');
  expect(page).not.toContain("No session heartbeat");
  expect(page).toContain(
    "agent')+' working · '+plural(projects.length,'project",
  );
});

test("a child verifier context overrides its agent parent worktree", () => {
  expect(
    selectAgentWorkContext("/work/spec-sync", [
      { command: "grok --continue", cwd: "/work/spec-sync" },
      {
        command: "specsync change check CHG-0068",
        cwd: "/work/spec-sync/.claude/worktrees/fix-sandbox-14-16",
      },
    ]),
  ).toEqual({
    cwd: "/work/spec-sync/.claude/worktrees/fix-sandbox-14-16",
    operation: "Verifying a Spec Sync change",
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
