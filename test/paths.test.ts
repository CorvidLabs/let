import { describe, expect, test } from "bun:test";
import { encodeClaudeProjectPath } from "../src/paths.ts";

describe("encodeClaudeProjectPath", () => {
  test("encodes absolute unix path like Claude projects dirs", () => {
    const encoded = encodeClaudeProjectPath(
      "/Users/leif/Development/_CorvidLabs/quill",
    );
    expect(encoded.startsWith("-")).toBe(true);
    expect(encoded).toContain("Users-leif-Development");
    expect(encoded).toContain("quill");
    // Double dash for path segment that was `_CorvidLabs` under Development/
    // Claude uses `-` for every `/`; `_` stays.
    expect(encoded).toBe("-Users-leif-Development--CorvidLabs-quill");
  });
});
