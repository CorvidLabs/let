/**
 * `let` CLI — doctor, find, where, context, version, help.
 */

import { buildScanContext } from "./catalog/context-builder.ts";
import { buildContext } from "./catalog/context.ts";
import { findAssets } from "./catalog/find.ts";
import {
  FIND_KINDS,
  isFindKind,
  isFindScope,
  type FindScope,
} from "./catalog/types.ts";
import { whereAmI } from "./catalog/where.ts";
import { runDoctor } from "./doctor.ts";
import { LET_VERSION, printEnvelope, withEnvelope } from "./envelope.ts";
import { LetError } from "./errors.ts";

type ParsedArgs = {
  command: string;
  positionals: string[];
  flags: Map<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }
    if (arg === "--json" || arg === "-j") {
      flags.set("json", true);
    } else if (arg === "--help" || arg === "-h") {
      flags.set("help", true);
    } else if (arg === "--version" || arg === "-V") {
      flags.set("version", true);
    } else if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      flags.set(arg.slice(2, eq), arg.slice(eq + 1));
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        flags.set(key, next);
        i++;
      } else {
        flags.set(key, true);
      }
    } else if (arg.startsWith("-")) {
      flags.set(arg, true);
    } else {
      positionals.push(arg);
    }
  }
  const command = positionals[0] ?? "help";
  return {
    command,
    positionals: positionals.slice(1),
    flags,
  };
}

function flagStr(flags: Map<string, string | boolean>, key: string): string | undefined {
  const v = flags.get(key);
  return typeof v === "string" ? v : undefined;
}

function helpText(): string {
  return `let ${LET_VERSION} — universal agent-asset locator + workbed

Usage:
  let doctor [--json]
  let where [path] [--cwd <path>] [--json]
  let find <kind> [--scope project|user|all] [--host <id>] [--query <text>]
                  [--cwd <path>] [--repo <path>] [--limit N] [--json]
  let context [--pack brief|full] [--cwd <path>] [--json]
  let version [--json]
  let help

Kinds: ${FIND_KINDS.join(", ")}

Examples:
  let find worktrees --json
  let find skills --query worktree --json
  let where .
  let context --pack brief --json

Federation over relocation — indexes .claude/worktrees, ~/.codex, git, …
Docs: docs/design.md
`;
}

async function run(): Promise<number> {
  const parsed = parseArgs(process.argv.slice(2));
  const json =
    parsed.flags.has("json") || process.env.LET_JSON === "1";

  if (
    !json &&
    (parsed.flags.has("help") ||
      parsed.command === "help" ||
      (parsed.command === "" && !parsed.flags.has("version")))
  ) {
    process.stdout.write(helpText());
    return 0;
  }

  if (!json && (parsed.flags.has("version") || parsed.command === "version")) {
    process.stdout.write(`${LET_VERSION}\n`);
    return 0;
  }

  const command =
    parsed.flags.has("version") || parsed.command === "version"
      ? "version"
      : parsed.command === ""
        ? "help"
        : parsed.command;

  const envelope = await withEnvelope(command, async () => {
    if (command === "version") {
      return { version: LET_VERSION };
    }
    if (command === "help") {
      return { text: helpText(), version: LET_VERSION };
    }
    if (command === "doctor") {
      return runDoctor(process.cwd());
    }

    const cwd = flagStr(parsed.flags, "cwd");
    const repo = flagStr(parsed.flags, "repo");
    const scopeRaw = flagStr(parsed.flags, "scope") ?? "project";
    if (!isFindScope(scopeRaw)) {
      throw new LetError("usage", `Invalid --scope: ${scopeRaw}`, {
        scope: scopeRaw,
      });
    }
    const scope: FindScope = scopeRaw;
    const limitRaw = flagStr(parsed.flags, "limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;
    if (limitRaw && (!Number.isFinite(limit) || (limit ?? 0) < 1)) {
      throw new LetError("validation", `--limit must be a positive number`, {
        limit: limitRaw,
      });
    }

    const ctx = buildScanContext({ cwd, repo, scope, limit });

    if (command === "find") {
      const kind = parsed.positionals[0];
      if (!kind || !isFindKind(kind)) {
        throw new LetError(
          "usage",
          `find requires a kind. One of: ${FIND_KINDS.join(", ")}`,
          { kind: kind ?? null },
        );
      }
      const result = await findAssets(kind, ctx, {
        host: flagStr(parsed.flags, "host"),
        query: flagStr(parsed.flags, "query"),
      });
      return result;
    }

    if (command === "where") {
      const target = parsed.positionals[0];
      return whereAmI(ctx, target);
    }

    if (command === "context") {
      const packRaw = flagStr(parsed.flags, "pack") ?? "brief";
      if (packRaw !== "brief" && packRaw !== "full") {
        throw new LetError("usage", `--pack must be brief|full`, {
          pack: packRaw,
        });
      }
      return buildContext(ctx, packRaw);
    }

    if (command === "show" || command === "open") {
      throw new LetError(
        "dependency",
        `${command} lands in PR2. Use find/where/context for now.`,
        { command, pr: "2" },
      );
    }

    throw new LetError(
      "usage",
      `Unknown command: ${command}. Try: let help`,
      { command },
    );
  });

  // Attach truncation meta when present
  if (
    envelope.ok &&
    envelope.data &&
    typeof envelope.data === "object" &&
    envelope.data !== null &&
    "truncated" in envelope.data
  ) {
    const d = envelope.data as { truncated?: boolean; total?: number };
    if (d.truncated) {
      envelope.meta.truncated = true;
      envelope.meta.total = d.total;
    }
  }

  printEnvelope(envelope, true);
  if (envelope.ok) {
    return 0;
  }
  switch (envelope.error.code) {
    case "usage":
    case "validation":
      return 1;
    case "not_found":
      return 2;
    case "conflict":
    case "unsafe":
      return 3;
    case "dependency":
      return 4;
    default:
      return 10;
  }
}

const exitCode = await run();
process.exit(exitCode);
