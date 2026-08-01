import { describe, expect, test } from "bun:test";
import { fleetAdapterFor, fleetSessionDetail } from "../src/fleet-adapters.ts";
import { runLet } from "../src/run.ts";
import {
  buildFleetSnapshot,
  fleetContextLabels,
  fleetHtml,
  fleetLiveChangeAnnouncement,
  fleetStateForSessions,
  gitEvidence,
  mergeFleetOpenKeys,
  parseLocalAgentProcessLines,
  redactLocalDetail,
  retainFleetOpenKeys,
  selectAgentWorkContext,
} from "../src/web.ts";

describe("web fleet snapshot", () => {
  test("is metadata-only and bounded", async () => {
    const snapshot = await buildFleetSnapshot(process.cwd(), Date.now());
    expect(snapshot.source).toBe("let");
    expect(snapshot.liveProcessDetection).toBe("local-process");
    expect(JSON.stringify(snapshot.workingNow)).not.toContain('"cwd"');
    expect(JSON.stringify(snapshot.agents)).not.toContain("/Users/");
    const repositories = [...snapshot.recentActivity, ...snapshot.history];
    expect(repositories.length).toBeLessThanOrEqual(48);
    expect(snapshot.policy).toContain("redacted local task context");
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
  expect(page).toContain("Let Fleet / local control room");
  expect(page).toContain("Latest prompt or update");
  expect(page).toContain("Recent output");
  expect(page).toContain("Show supervision details");
  expect(page).toContain("/assets/tokens.css");
  expect(page).toContain("data-corvid-theme-toggle");
  expect(page).toContain("Let Fleet / local control room");
});

test("agent context keeps project, worktree, and branch explicit", () => {
  expect(
    fleetContextLabels({
      project: "let",
      worktree: "let",
      branch: "feat/fleet",
    }),
  ).toEqual(["Project: let", "Worktree: let", "Branch: feat/fleet"]);
});

test("Fleet session adapters label Claude, Codex, Grok, Gemini, and Antigravity fixtures", () => {
  const fixtures = [
    { host: "claude", meta: {}, provider: "Claude" },
    { host: "codex", meta: {}, provider: "Codex" },
    { host: "grok", meta: {}, provider: "Grok" },
    { host: "gemini", meta: {}, provider: "Gemini" },
    {
      host: "gemini",
      meta: { source: "antigravity-cli" },
      provider: "Antigravity",
    },
  ] as const;
  for (const fixture of fixtures) {
    expect(
      fleetAdapterFor({
        id: `sessions:${fixture.provider}`,
        kind: "sessions",
        host: fixture.host,
        name: fixture.provider,
        path: `/fixture/${fixture.provider}.jsonl`,
        scope: "user",
        meta: fixture.meta,
      })?.provider,
    ).toBe(fixture.provider);
  }
});

test("Fleet adapter fixture keeps the latest redacted prompt and output", () => {
  const detail = fleetSessionDetail(
    [
      '{"cwd":"/Users/leif/Development/_CorvidLabs/let/.worktrees/fleet-web","prompt":"First prompt"}',
      '{"output":"token=ghp_abcdefghijklmnopqrstuvwxyz123456"}',
      '{"status":"Finished safely"}',
    ].join("\n"),
    redactLocalDetail,
  );
  expect(detail.latestMessage).toBe("Finished safely");
  expect(detail.recentActivity).toContain("First prompt");
  expect(JSON.stringify(detail)).toContain("[REDACTED]");
  expect(detail.contextPath).toBe(
    "/Users/leif/Development/_CorvidLabs/let/.worktrees/fleet-web",
  );
});

test("local supervisor details redact known secret-shaped values", () => {
  const detail = redactLocalDetail(
    "token=ghp_abcdefghijklmnopqrstuvwxyz123456 password=private-value",
  );
  expect(detail).toContain("token=[REDACTED]");
  expect(detail).toContain("password=[REDACTED]");
  expect(detail).not.toContain("private-value");
  expect(redactLocalDetail("/Users/leif/Development/private")).toBe(
    "[LOCAL PATH]",
  );
});

test("Fleet page preserves refresh state with stable agent and project panel keys", () => {
  const page = fleetHtml();
  expect(page).toContain('data-view="agents"');
  expect(page).toContain(">Agents</button>");
  expect(page).toContain(">Projects</button>");
  expect(page).toContain("Unassigned running agent");
  expect(page).toContain("details[data-fleet-key][open]");
  expect(page).toContain("captureUiState");
  expect(page).toContain("restoreUiState");
  expect(page).toContain("button.dataset.view===view");
  expect(page).toContain("setInterval(refresh,20000)");
  expect(page).toContain('role="status" aria-live="polite"');
  expect(page).not.toContain("No session heartbeat");
  expect(page).toContain(
    "agent')+' working · '+plural(projects.length,'project",
  );
});

test("Fleet refresh retains only panels with a current stable key", () => {
  expect(
    retainFleetOpenKeys(
      ["agent:codex", "agent:grok", "project:let"],
      ["agent:codex", "project:let"],
    ),
  ).toEqual(["agent:codex", "project:let"]);
});

test("Fleet refresh keeps a hidden view's open panel until its card is removed", () => {
  expect(
    mergeFleetOpenKeys(
      ["agent:grok", "project:let"],
      ["project:let", "project:quill"],
      ["project:let"],
    ),
  ).toEqual(["agent:grok", "project:let"]);
});

test("Fleet announces only material agent changes after its first snapshot", () => {
  expect(
    fleetLiveChangeAnnouncement(
      [{ agent: "Codex", status: "recent" }],
      [
        { agent: "Codex", status: "working" },
        { agent: "Grok", status: "recent" },
      ],
    ),
  ).toBe("Codex is now working. Grok is now visible.");
  expect(
    fleetLiveChangeAnnouncement([], [{ agent: "Codex", status: "recent" }]),
  ).toBe("");
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

test("Git evidence reports a Spec Sync change when the command names one", () => {
  const evidence = gitEvidence(process.cwd(), "specsync change check CHG-0068");
  expect(evidence?.specSyncChange).toBe("CHG-0068");
  expect(typeof evidence?.dirty).toBe("boolean");
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
