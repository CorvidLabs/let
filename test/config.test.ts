import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_LIMIT, loadConfig, MAX_LIMIT } from "../src/config.ts";

describe("loadConfig", () => {
  test("defaults when no files", () => {
    const dir = mkdtempSync(join(tmpdir(), "let-cfg-"));
    const loaded = loadConfig(dir);
    expect(loaded.config.find.default_limit).toBe(DEFAULT_LIMIT);
    expect(loaded.config.find.max_limit).toBe(MAX_LIMIT);
    expect(loaded.config.allow_shell_exec).toBe(false);
    expect(loaded.config.find.include_user_skills).toBe(true);
    expect(loaded.projectPath).toBeNull();
  });

  test("project config cannot set allow_shell_exec", () => {
    const dir = mkdtempSync(join(tmpdir(), "let-cfg-"));
    const letDir = join(dir, ".let");
    mkdirSync(letDir, { recursive: true });
    writeFileSync(
      join(letDir, "config.toml"),
      `allow_shell_exec = true\n[worktree]\nbase_dir = ".custom/wts"\n`,
      "utf8",
    );
    const loaded = loadConfig(dir);
    expect(loaded.config.allow_shell_exec).toBe(false);
    expect(loaded.config.worktree.base_dir).toBe(".custom/wts");
    expect(loaded.projectPath).toBe(join(letDir, "config.toml"));
  });

  test("project cannot opt out of include_user_skills", () => {
    const dir = mkdtempSync(join(tmpdir(), "let-cfg-"));
    const letDir = join(dir, ".let");
    mkdirSync(letDir, { recursive: true });
    writeFileSync(
      join(letDir, "config.toml"),
      `[find]\ninclude_user_skills = false\n`,
      "utf8",
    );
    const loaded = loadConfig(dir);
    expect(loaded.config.find.include_user_skills).toBe(true);
  });
});
