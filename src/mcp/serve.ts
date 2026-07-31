/**
 * `let mcp serve` — read-only MCP server over stdio (JSON-RPC 2.0, NDJSON).
 * Tools: let_find, let_where, let_context, let_show, let_doctor, let_route, let_history
 */

import { buildContext } from "../catalog/context.ts";
import { buildScanContext } from "../catalog/context-builder.ts";
import { findAssets } from "../catalog/find.ts";
import { buildHistory } from "../catalog/history.ts";
import { routeSkills } from "../catalog/route.ts";
import { showAsset } from "../catalog/show.ts";
import {
  FIND_KINDS,
  type FindScope,
  isFindKind,
  isFindScope,
} from "../catalog/types.ts";
import { whereAmI } from "../catalog/where.ts";
import { runDoctor } from "../doctor.ts";
import { errorEnvelope, LET_VERSION, successEnvelope } from "../envelope.ts";
import { isLetError, toLetError } from "../errors.ts";

type JsonRpcReq = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

const TOOLS = [
  {
    name: "let_find",
    description:
      "Federated index of agent assets without full bodies. Default scope=project.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: [...FIND_KINDS] },
        scope: { type: "string", enum: ["project", "user", "all"] },
        host: { type: "string" },
        query: { type: "string" },
        cwd: { type: "string" },
        repo: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 },
      },
      required: ["kind"],
      additionalProperties: false,
    },
  },
  {
    name: "let_where",
    description:
      "Classify a path: host, kind, repo_root, branch, sibling worktrees.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        cwd: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "let_context",
    description: "Unified context pack (never includes sessions).",
    inputSchema: {
      type: "object",
      properties: {
        pack: { type: "string", enum: ["brief", "full"] },
        cwd: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "let_show",
    description: "Progressive load one asset. sessions/memory metadata-only.",
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string" },
        id: { type: "string" },
        cwd: { type: "string" },
      },
      required: ["kind", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "let_doctor",
    description: "Adapter health and host roots.",
    inputSchema: {
      type: "object",
      properties: { cwd: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    name: "let_route",
    description: "Rank skills for a natural-language query (agent.3md first).",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string" },
        host: { type: "string" },
        cwd: { type: "string" },
        limit: { type: "integer" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "let_history",
    description:
      "Usage report: hosts and projects ranked by session activity (path-only).",
    inputSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: ["project", "user", "all"] },
        cwd: { type: "string" },
        limit: { type: "integer" },
      },
      additionalProperties: false,
    },
  },
] as const;

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function toolResult(data: unknown, isError = false): unknown {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data),
      },
    ],
    isError,
  };
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const started = Date.now();
  try {
    switch (name) {
      case "let_find": {
        const kind = str(args.kind);
        if (!kind || !isFindKind(kind)) {
          throw toLetError(new Error(`Invalid kind: ${kind}`));
        }
        const scopeRaw = str(args.scope) ?? "project";
        if (!isFindScope(scopeRaw)) {
          throw toLetError(new Error(`Invalid scope: ${scopeRaw}`));
        }
        const ctx = buildScanContext({
          cwd: str(args.cwd),
          repo: str(args.repo),
          scope: scopeRaw as FindScope,
          limit: num(args.limit),
        });
        const data = await findAssets(kind, ctx, {
          host: str(args.host),
          query: str(args.query),
        });
        return toolResult(successEnvelope("find", data, started));
      }
      case "let_where": {
        const cwd = str(args.cwd);
        const path = str(args.path);
        const ctx = buildScanContext({ cwd: cwd ?? path });
        const data = whereAmI(ctx, path);
        return toolResult(successEnvelope("where", data, started));
      }
      case "let_context": {
        const pack = str(args.pack) === "full" ? "full" : "brief";
        const ctx = buildScanContext({ cwd: str(args.cwd) });
        const data = await buildContext(ctx, pack);
        return toolResult(successEnvelope("context", data, started));
      }
      case "let_show": {
        const kind = str(args.kind);
        const id = str(args.id);
        if (!kind || !id) {
          throw toLetError(new Error("kind and id required"));
        }
        const ctx = buildScanContext({ cwd: str(args.cwd) });
        const data = await showAsset(kind, id, ctx);
        return toolResult(successEnvelope("show", data, started));
      }
      case "let_doctor": {
        const data = runDoctor(str(args.cwd) ?? process.cwd());
        return toolResult(successEnvelope("doctor", data, started));
      }
      case "let_route": {
        const text = str(args.text);
        if (!text) {
          throw toLetError(new Error("text required"));
        }
        const ctx = buildScanContext({
          cwd: str(args.cwd),
          limit: num(args.limit),
        });
        const data = await routeSkills(text, ctx, {
          host: str(args.host),
          limit: num(args.limit),
        });
        return toolResult(successEnvelope("route", data, started));
      }
      case "let_history": {
        const scopeRaw = str(args.scope) ?? "user";
        if (!isFindScope(scopeRaw)) {
          throw toLetError(new Error(`Invalid scope: ${scopeRaw}`));
        }
        const ctx = buildScanContext({
          cwd: str(args.cwd),
          scope: scopeRaw as FindScope,
          limit: num(args.limit),
        });
        const data = await buildHistory(ctx);
        return toolResult(successEnvelope("history", data, started));
      }
      default:
        return toolResult(
          errorEnvelope(
            "mcp",
            toLetError(new Error(`Unknown tool: ${name}`)),
            started,
          ),
          true,
        );
    }
  } catch (err) {
    const le = isLetError(err) ? err : toLetError(err);
    return toolResult(errorEnvelope("mcp", le, started), true);
  }
}

function respond(
  id: string | number | null | undefined,
  result: unknown,
): void {
  const msg = {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function respondError(
  id: string | number | null | undefined,
  code: number,
  message: string,
): void {
  const msg = {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  };
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

/**
 * Run MCP stdio loop until stdin closes.
 */
export async function runMcpServe(): Promise<void> {
  const decoder = new TextDecoder();
  let buf = "";

  // Avoid blocking on TTY without input in tests — still works for pipe
  process.stdin.setEncoding("utf8");

  for await (const chunk of process.stdin) {
    buf += typeof chunk === "string" ? chunk : decoder.decode(chunk);
    let nl = buf.indexOf("\n");
    while (nl >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) {
        nl = buf.indexOf("\n");
        continue;
      }
      nl = buf.indexOf("\n");
      let req: JsonRpcReq;
      try {
        req = JSON.parse(line) as JsonRpcReq;
      } catch {
        respondError(null, -32700, "Parse error");
        continue;
      }
      const id = req.id;
      const method = req.method ?? "";
      const params = (req.params ?? {}) as Record<string, unknown>;

      try {
        if (method === "initialize") {
          respond(id, {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "let", version: LET_VERSION },
          });
          continue;
        }
        if (
          method === "notifications/initialized" ||
          method === "initialized"
        ) {
          // no response for notifications without id
          if (id !== undefined && id !== null) {
            respond(id, {});
          }
          continue;
        }
        if (method === "tools/list") {
          respond(id, { tools: TOOLS });
          continue;
        }
        if (method === "tools/call") {
          const name = str(params.name);
          const args = (params.arguments ?? {}) as Record<string, unknown>;
          if (!name) {
            respondError(id, -32602, "tools/call requires name");
            continue;
          }
          const result = await callTool(name, args);
          respond(id, result);
          continue;
        }
        if (method === "ping") {
          respond(id, {});
          continue;
        }
        respondError(id, -32601, `Method not found: ${method}`);
      } catch (err) {
        respondError(
          id,
          -32603,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }
}
