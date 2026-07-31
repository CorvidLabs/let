/**
 * Shared command runner for standalone CLI and fledge plugin host.
 */

import { buildContext } from "./catalog/context.ts";
import { buildScanContext } from "./catalog/context-builder.ts";
import { findAssets } from "./catalog/find.ts";
import { buildHistory } from "./catalog/history.ts";
import { routeSkills } from "./catalog/route.ts";
import { openPath, showAsset } from "./catalog/show.ts";
import {
  FIND_KINDS,
  type FindScope,
  isFindKind,
  isFindScope,
} from "./catalog/types.ts";
import { whereAmI } from "./catalog/where.ts";
import { loadConfig } from "./config.ts";
import { runDoctor } from "./doctor.ts";
import { type Envelope, LET_VERSION, withEnvelope } from "./envelope.ts";
import { LetError } from "./errors.ts";
import { runMcpServe } from "./mcp/serve.ts";
import { initLetWorkbed } from "./workbed/init.ts";
import {
  memoryDelete,
  memoryGet,
  memoryList,
  memorySet,
} from "./workbed/memory.ts";
import {
  getSuperskill,
  listSuperskills,
  writeExampleSuperskill,
} from "./workbed/superskill.ts";
import { worktreeAdd, worktreeRemove } from "./workbed/worktree-write.ts";

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

Discovery:
  let doctor [--json]
  let where [path] [--cwd <path>] [--json]
  let find <kind> [--scope project|user|all] [--host <id>] [--query <text>]
                  [--cwd <path>] [--repo <path>] [--limit N] [--json]
  let show <kind> <id|name> [--cwd <path>] [--json]
  let open <path> [--cwd <path>] [--json]
  let context [--pack brief|full] [--cwd <path>] [--json]
  let history [--scope project|user|all] [--cwd <path>] [--json]
  let skill route|list|get <…> [--json]
  let route <text>                 # alias for skill route

Workbed:
  let init [--cwd <path>] [--json]
  let worktree list|add|remove …
  let memory list|get|set|delete …
  let super list|get|init-example …
  let config show [--json]

MCP:
  let mcp serve                    # read-only tools over stdio

Meta:
  let version [--json]
  let help

Install (fledge):
  fledge plugins install CorvidLabs/let
  fledge let find worktrees --json

Kinds: ${FIND_KINDS.join(", ")}
Federation over relocation — indexes host assets in place.
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

  // MCP serve takes over stdio — no JSON envelope wrapper
  if (command === "mcp") {
    const sub = parsed.positionals[0];
    if (sub !== "serve") {
      const bad = await withEnvelope("mcp", async () => {
        throw new LetError("usage", "Usage: let mcp serve", {
          sub: sub ?? null,
        });
      });
      return {
        code: exitCodeForEnvelope(bad),
        text: `${JSON.stringify(bad, null, 2)}\n`,
        envelope: bad,
      };
    }
    await runMcpServe();
    return { code: 0, text: "" };
  }

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

    let cwd = flagStr(parsed.flags, "cwd") ?? defaults.cwd;
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

    // where [path]: when no explicit --cwd, scope the scan to the target path's
    // repo (linked worktrees resolve to the parent via git common-dir).
    if (
      command === "where" &&
      !flagStr(parsed.flags, "cwd") &&
      parsed.positionals[0]
    ) {
      cwd = parsed.positionals[0];
    }

    // history defaults to user scope for "what have I used on this Mac?"
    const historyScope: FindScope =
      command === "history" && !flagStr(parsed.flags, "scope") ? "user" : scope;

    const ctx = buildScanContext({
      cwd,
      repo,
      scope: command === "history" ? historyScope : scope,
      limit,
    });

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

    if (command === "history" || command === "usage") {
      return buildHistory(ctx);
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
      if (command === "route") {
        const text = parsed.positionals.join(" ").trim();
        if (!text) {
          throw new LetError(
            "usage",
            'route requires text. Example: let route "find worktrees"',
            {},
          );
        }
        return routeSkills(text, ctx, {
          host: flagStr(parsed.flags, "host"),
          limit,
        });
      }
      const sub = parsed.positionals[0];
      if (sub === "route") {
        const text = parsed.positionals.slice(1).join(" ").trim();
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
      if (sub === "list") {
        return findAssets("skills", ctx, {
          host: flagStr(parsed.flags, "host"),
          query: flagStr(parsed.flags, "query"),
        });
      }
      if (sub === "get") {
        const name = parsed.positionals[1];
        if (!name) {
          throw new LetError("usage", "skill get requires <name|id>", {});
        }
        return showAsset("skills", name, ctx);
      }
      throw new LetError(
        "usage",
        'Usage: let skill route|list|get …  (or: let route "…")',
        { sub: sub ?? null },
      );
    }

    if (command === "init") {
      const root = ctx.repoRoot ?? ctx.cwd;
      return initLetWorkbed(root);
    }

    if (command === "worktree" || command === "worktrees") {
      const sub = parsed.positionals[0] ?? "list";
      if (sub === "list") {
        return findAssets("worktrees", ctx, {
          host: flagStr(parsed.flags, "host"),
          query: flagStr(parsed.flags, "query"),
        });
      }
      if (sub === "add") {
        const name = parsed.positionals[1] ?? flagStr(parsed.flags, "name");
        if (!name) {
          throw new LetError(
            "usage",
            "worktree add requires <name> [--branch <b>]",
            {},
          );
        }
        const root = ctx.repoRoot ?? ctx.cwd;
        return worktreeAdd({
          repoRoot: root,
          name,
          branch: flagStr(parsed.flags, "branch"),
        });
      }
      if (sub === "remove" || sub === "rm") {
        const path = parsed.positionals[1];
        if (!path) {
          throw new LetError("usage", "worktree remove requires <path>", {});
        }
        const root = ctx.repoRoot ?? ctx.cwd;
        return worktreeRemove({
          repoRoot: root,
          path,
          force: parsed.flags.has("force"),
        });
      }
      throw new LetError("usage", "Usage: let worktree list|add|remove", {
        sub,
      });
    }

    if (command === "memory") {
      const sub = parsed.positionals[0] ?? "list";
      const memScope =
        scope === "user" || flagStr(parsed.flags, "scope") === "user"
          ? "user"
          : "project";
      if (sub === "list") {
        return {
          scope: memScope,
          items: memoryList(memScope, ctx.repoRoot),
        };
      }
      if (sub === "get") {
        const key = parsed.positionals[1];
        if (!key) {
          throw new LetError("usage", "memory get requires <key>", {});
        }
        return memoryGet(key, memScope, ctx.repoRoot);
      }
      if (sub === "set") {
        const key = parsed.positionals[1];
        const raw = parsed.positionals.slice(2).join(" ");
        if (!key || !raw) {
          throw new LetError(
            "usage",
            "memory set requires <key> <json-or-text>",
            {},
          );
        }
        let value: unknown = raw;
        try {
          value = JSON.parse(raw);
        } catch {
          // plain text
        }
        return memorySet(key, value, memScope, ctx.repoRoot);
      }
      if (sub === "delete" || sub === "rm") {
        const key = parsed.positionals[1];
        if (!key) {
          throw new LetError("usage", "memory delete requires <key>", {});
        }
        return memoryDelete(key, memScope, ctx.repoRoot);
      }
      throw new LetError("usage", "Usage: let memory list|get|set|delete", {
        sub,
      });
    }

    if (
      command === "super" ||
      command === "superskill" ||
      command === "superskills"
    ) {
      const sub = parsed.positionals[0] ?? "list";
      const superScope =
        scope === "all" ? "all" : scope === "user" ? "user" : "project";
      if (sub === "list") {
        return {
          items: listSuperskills(superScope, ctx.repoRoot),
        };
      }
      if (sub === "get") {
        const name = parsed.positionals[1];
        if (!name) {
          throw new LetError("usage", "super get requires <name>", {});
        }
        return getSuperskill(name, superScope, ctx.repoRoot);
      }
      if (sub === "init-example") {
        const root = ctx.repoRoot ?? ctx.cwd;
        return writeExampleSuperskill(root);
      }
      throw new LetError("usage", "Usage: let super list|get|init-example", {
        sub,
      });
    }

    if (command === "config") {
      const sub = parsed.positionals[0] ?? "show";
      if (sub === "show" || sub === "get") {
        const loaded = loadConfig(ctx.cwd);
        return {
          config: loaded.config,
          sources: loaded.sources,
          userPath: loaded.userPath,
          projectPath: loaded.projectPath,
        };
      }
      throw new LetError("usage", "Usage: let config show", { sub });
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
