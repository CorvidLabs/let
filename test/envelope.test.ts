import { describe, expect, test } from "bun:test";
import {
  errorEnvelope,
  successEnvelope,
  withEnvelope,
} from "../src/envelope.ts";
import { LetError } from "../src/errors.ts";

describe("envelope", () => {
  test("successEnvelope shape", () => {
    const started = Date.now() - 5;
    const env = successEnvelope("doctor", { ok: true }, started);
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.command).toBe("doctor");
      expect(env.data).toEqual({ ok: true });
      expect(env.meta.version).toBeTruthy();
      expect(env.meta.duration_ms).toBeGreaterThanOrEqual(0);
      expect(typeof env.meta.cwd).toBe("string");
    }
  });

  test("errorEnvelope shape", () => {
    const err = new LetError("not_found", "missing", { id: "x" });
    const env = errorEnvelope("show.skills", err, Date.now());
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("not_found");
      expect(env.error.message).toBe("missing");
      expect(env.error.details).toEqual({ id: "x" });
    }
  });

  test("withEnvelope catches LetError", async () => {
    const env = await withEnvelope("find.worktrees", () => {
      throw new LetError("dependency", "not yet", { pr: "1b" });
    });
    expect(env.ok).toBe(false);
    if (!env.ok) {
      expect(env.error.code).toBe("dependency");
    }
  });

  test("withEnvelope success", async () => {
    const env = await withEnvelope("version", () => ({ version: "0.1.0" }));
    expect(env.ok).toBe(true);
    if (env.ok) {
      expect(env.data).toEqual({ version: "0.1.0" });
    }
  });
});

describe("LetError exit codes", () => {
  test("maps codes to exit numbers", () => {
    expect(new LetError("usage", "u").exitCode).toBe(1);
    expect(new LetError("validation", "v").exitCode).toBe(1);
    expect(new LetError("not_found", "n").exitCode).toBe(2);
    expect(new LetError("conflict", "c").exitCode).toBe(3);
    expect(new LetError("unsafe", "s").exitCode).toBe(3);
    expect(new LetError("dependency", "d").exitCode).toBe(4);
    expect(new LetError("internal", "i").exitCode).toBe(10);
  });
});
