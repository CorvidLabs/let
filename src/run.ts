/**
 * Shared command runner for standalone CLI and fledge plugin host.
 */

import { buildContext } from "./catalog/context.ts";
import { buildScanContext } from "./catalog/context-builder.ts";
import { findAssets } from "./catalog/find.ts";
import { routeSkills } from "./catalog/route.ts";
import { openPath, showAsset } from "./catalog/show.ts";
import {
  FIND_KINDS,
  type FindScope,
  isFindKind,
  isFindScope,
} from "./catalog/types.ts";
import { whereAmI } from "./catalog/where.ts";
import { runDoctor } from "./doctor.ts";
import { type Envelope, LET_VERSION, withEnvelope } from "./envelope.ts";
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

function flagStr(
  flags: Map<string, string | boolean>,
  key: string,
): string | undefined {
  const v = flags.get(key);
  return typeof v === "string" ? v : undefined;
}

export function helpText(): string {
  return `let ${LET_VERSION} — universal agent-asset locator + workbed

Usage:
  let doctor [--json]
  let where [path] [--cwd <path>] [--json]
  let find <kind> [--scope project|user|all] [--host <id>] [--query <text>]
                  [--cwd <path>] [--repo <path>] [--limit N] [--json]
  let show <kind> <id|name> [--cwd <path>] [--json]
  let open <path> [--cwd <path>] [--json]
  let skill route <text> [--host <id>] [--limit N] [--json]
  let route <text>                 # alias for skill route
  let context [--pack brief|full] [--cwd <path>] [--json]
  let version [--json]
  let help

Install (fledge):
  fledge plugins install CorvidLabs/let
  fledge let find worktrees --json

Kinds: ${FIND_KINDS.join(", ")}
Show aliases: skill, agent, worktree, instruction, session

Federation over relocation — indexes .claude/worktrees, ~/.codex, git, …
Docs: docs/usage.md
`;
}

function exitCodeForEnvelope(envelope: Envelope): number {
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

export type RunResult = {
  code: number;
  /** Full text to print (help plain text, or JSON envelope). */
  text: string;
  envelope?: Envelope;
};

/**
 * Run let with argv (no process.argv / process.exit).
 * @param argv - args after the binary name (e.g. ["find", "worktrees", "--json"])
 * @param defaults - optional project root when --cwd omitted (fledge init.project.root)
 */
export async function runLet(
  argv: string[],
  defaults: { cwd?: string } = {},
): Promise<RunResult> {
  const parsed = parseArgs(argv);
  const json =
    parsed.flags.has("json") ||
    process.env.LET_JSON === "1" ||
    process.env.FLEDGE_PLUGIN === "1";

  if (
    !json &&
    (parsed.flags.has("help") ||
      parsed.command === "help" ||
      (parsed.command === "" && !parsed.flags.has("version")))
  ) {
    return { code: 0, text: helpText() };
  }

  if (!json && (parsed.flags.has("version") || parsed.command === "version")) {
    return { code: 0, text: `${LET_VERSION}\n` };
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
      return runDoctor(
        flagStr(parsed.flags, "cwd") ?? defaults.cwd ?? process.cwd(),
      );
    }

    const cwd = flagStr(parsed.flags, "cwd") ?? defaults.cwd;
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
      return findAssets(kind, ctx, {
        host: flagStr(parsed.flags, "host"),
        query: flagStr(parsed.flags, "query"),
      });
    }

    if (command === "where") {
      return whereAmI(ctx, parsed.positionals[0]);
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

    if (command === "show") {
      const kind = parsed.positionals[0];
      const ref = parsed.positionals[1];
      if (!kind || !ref) {
        throw new LetError(
          "usage",
          "show requires <kind> <id|name>. Example: let show skill find-worktrees",
          { kind: kind ?? null, ref: ref ?? null },
        );
      }
      return showAsset(kind, ref, ctx);
    }

    if (command === "open") {
      const target = parsed.positionals[0];
      if (!target) {
        throw new LetError("usage", "open requires <path>", {});
      }
      return openPath(target, ctx);
    }

    if (command === "skill" || command === "route") {
      let textParts: string[] = [];
      if (command === "skill") {
        const sub = parsed.positionals[0];
        if (sub !== "route") {
          throw new LetError(
            "usage",
            'Usage: let skill route "<text>"  (or: let route "<text>")',
            { sub: sub ?? null },
          );
        }
        textParts = parsed.positionals.slice(1);
      } else {
        textParts = parsed.positionals;
      }
      const text = textParts.join(" ").trim();
      if (!text) {
        throw new LetError(
          "usage",
          'skill route requires text. Example: let skill route "find worktrees"',
          {},
        );
      }
      return routeSkills(text, ctx, {
        host: flagStr(parsed.flags, "host"),
        limit,
      });
    }

    throw new LetError("usage", `Unknown command: ${command}. Try: let help`, {
      command,
    });
  });

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

  const text = `${JSON.stringify(envelope, null, 2)}\n`;
  return {
    code: exitCodeForEnvelope(envelope),
    text,
    envelope,
  };
}
