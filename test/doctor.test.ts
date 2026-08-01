import { describe, expect, test } from "bun:test";
import { runDoctor } from "../src/doctor.ts";

describe("runDoctor", () => {
  test("returns checks and roots", () => {
    const report = runDoctor(process.cwd());
    expect(report.version).toBeTruthy();
    expect(report.checks.length).toBeGreaterThan(0);
    expect(report.roots["claude.home"]).toBeDefined();
    expect(report.roots["openai.skills"]).toBeDefined();
    expect(report.roots["project.claude.worktrees"]).toBeDefined();
    const git = report.checks.find((c) => c.id === "git");
    expect(git).toBeDefined();
  });
});
