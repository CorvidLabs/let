/**
 * Progressive disclosure: show full body for a card, with security caps.
 */

import { basename } from "node:path";
import { Agent } from "@corvidlabs/agent3md";
import type { ScanContext } from "../adapters/types.ts";
import { LetError } from "../errors.ts";
import { fileBytes, mtimeMs, pathExists, readTextFile } from "../fs-scan.ts";
import { gitBranch, gitHead, gitToplevel, safeRealpath } from "../git.ts";
import { findAssets } from "./find.ts";
import { findInstructions } from "./instructions.ts";
import { federateWorktrees } from "./merge.ts";
import { isDeniedBasename } from "./scan-policy.ts";
import type { FindKind, IndexCard } from "./types.ts";
import { isFindKind } from "./types.ts";

/** Max body bytes for allowed show kinds (design: 1 MiB). */
export const MAX_BODY_BYTES = 1_048_576;

/** Max preview for open (smaller). */
export const MAX_OPEN_PREVIEW_BYTES = 8_192;

export type AssetBody = IndexCard & {
  body?: string;
  payload?: Record<string, unknown>;
  truncated_body?: boolean;
};

const KIND_ALIASES: Record<string, FindKind> = {
  skill: "skills",
  skills: "skills",
  agent: "agents",
  agents: "agents",
  worktree: "worktrees",
  worktrees: "worktrees",
  instruction: "instructions",
  instructions: "instructions",
  session: "sessions",
  sessions: "sessions",
  task: "tasks",
  tasks: "tasks",
  command: "commands",
  commands: "commands",
  memory: "memory",
  mcp: "mcp",
  plugin: "plugins",
  plugins: "plugins",
  workflow: "workflows",
  workflows: "workflows",
  superskill: "superskills",
  superskills: "superskills",
};

export function normalizeShowKind(raw: string): FindKind {
  const key = raw.toLowerCase();
  const kind = KIND_ALIASES[key] ?? (isFindKind(key) ? key : null);
  if (!kind) {
    throw new LetError(
      "usage",
      `Unknown show kind: ${raw}. Try skills, agents, worktrees, instructions, sessions`,
      { kind: raw },
    );
  }
  return kind;
}

async function collectCards(
  kind: FindKind,
  ctx: ScanContext,
): Promise<IndexCard[]> {
  // High limit so name resolution is not clipped by DEFAULT_LIMIT
  const wide: ScanContext = { ...ctx, limit: 500 };
  switch (kind) {
    case "worktrees":
      return federateWorktrees(wide).cards;
    case "instructions":
      return findInstructions(wide);
    default: {
      const r = await findAssets(kind, wide);
      return r.items;
    }
  }
}

/**
 * Resolve ref to a single card. Ref may be id, exact name, or unique name prefix.
 */
export async function resolveCard(
  kind: FindKind,
  ref: string,
  ctx: ScanContext,
): Promise<IndexCard> {
  const cards = await collectCards(kind, ctx);
  if (cards.length === 0) {
    throw new LetError("not_found", `No ${kind} found in scope`, { kind, ref });
  }

  // Exact id
  const byId = cards.filter((c) => c.id === ref);
  if (byId.length === 1 && byId[0]) {
    return byId[0];
  }

  // Exact path
  const rp = safeRealpath(ref) ?? ref;
  const byPath = cards.filter(
    (c) => c.path === ref || c.path === rp || safeRealpath(c.path) === rp,
  );
  if (byPath.length === 1 && byPath[0]) {
    return byPath[0];
  }
  if (byPath.length > 1) {
    throw new LetError("conflict", `Multiple ${kind} match path ${ref}`, {
      kind,
      ref,
      candidates: byPath.map((c) => ({ id: c.id, name: c.name, path: c.path })),
    });
  }

  // Exact name (case-insensitive)
  const nameHits = cards.filter(
    (c) => c.name.toLowerCase() === ref.toLowerCase(),
  );
  if (nameHits.length === 1 && nameHits[0]) {
    return nameHits[0];
  }
  if (nameHits.length > 1) {
    throw new LetError(
      "conflict",
      `Multiple ${kind} named "${ref}"; pass full id`,
      {
        kind,
        ref,
        candidates: nameHits.map((c) => ({
          id: c.id,
          name: c.name,
          host: c.host,
          path: c.path,
        })),
      },
    );
  }

  // Unique id/name substring
  const sub = cards.filter(
    (c) =>
      c.id.includes(ref) ||
      c.name.toLowerCase().includes(ref.toLowerCase()) ||
      c.path.includes(ref),
  );
  if (sub.length === 1 && sub[0]) {
    return sub[0];
  }
  if (sub.length > 1) {
    throw new LetError("conflict", `Ambiguous ${kind} ref "${ref}"`, {
      kind,
      ref,
      candidates: sub.slice(0, 12).map((c) => ({
        id: c.id,
        name: c.name,
        host: c.host,
        path: c.path,
      })),
    });
  }

  throw new LetError("not_found", `${kind} not found: ${ref}`, { kind, ref });
}

function loadTextBody(
  path: string,
  ctx: ScanContext,
  maxBytes: number,
): { body?: string; truncated_body?: boolean; bytes?: number } {
  const name = basename(path);
  if (isDeniedBasename(name, ctx.policy)) {
    return { bytes: fileBytes(path) };
  }
  const bytes = fileBytes(path);
  if (bytes === undefined) {
    return {};
  }
  if (bytes > maxBytes) {
    const text = readTextFile(path, ctx.policy, maxBytes, {
      allowPartial: true,
    });
    return {
      body: text ?? undefined,
      truncated_body: true,
      bytes,
    };
  }
  const text = readTextFile(path, ctx.policy, maxBytes);
  return { body: text ?? undefined, truncated_body: false, bytes };
}

/** Paths that must never yield transcript/store bodies via open/show fallback. */
export function isSessionLikePath(path: string): boolean {
  const p = path.replace(/\\/g, "/");
  return (
    p.endsWith(".jsonl") ||
    p.endsWith(".sqlite") ||
    p.endsWith(".sqlite-wal") ||
    p.endsWith(".sqlite-shm") ||
    p.includes("/sessions/") ||
    p.includes("/.claude/projects/") ||
    p.includes("/.claude/tasks/") ||
    p.includes("/.cursor/chats/") ||
    p.includes("/.grok/sessions/") ||
    p.includes("/.grok/memtrace/") ||
    p.includes("/.gemini/history/") ||
    p.includes("/.gemini/antigravity/conversations/") ||
    p.includes("/.kimi-code/sessions/") ||
    p.includes("/.kimi-code/user-history/") ||
    p.includes("/.codex/sessions/") ||
    p.includes("/.codex/archived_sessions/") ||
    p.includes("/.let/sessions/") ||
    p.includes("/.let/memory/")
  );
}

function isPathOnlyCard(card: IndexCard): boolean {
  if (card.meta?.path_only === true) {
    return true;
  }
  const note = card.meta?.note?.toString() ?? "";
  if (note.toLowerCase().includes("secret")) {
    return true;
  }
  return false;
}

export async function showAsset(
  kindRaw: string,
  ref: string,
  ctx: ScanContext,
): Promise<AssetBody> {
  const kind = normalizeShowKind(kindRaw);
  const card = await resolveCard(kind, ref, ctx);

  // Sessions / tasks / memory: metadata only (no transcript or recall dump)
  // Cursor plans (tasks with source cursor.plans) allow body — handled below.
  if (kind === "sessions" || kind === "memory") {
    return {
      ...card,
      body: undefined,
      payload: {
        bytes: fileBytes(card.path) ?? card.meta?.bytes,
        mtime_ms: mtimeMs(card.path) ?? card.mtime_ms,
        path_only: true,
      },
    };
  }

  if (kind === "tasks" && card.meta?.source !== "cursor.plans") {
    return {
      ...card,
      body: undefined,
      payload: {
        bytes: fileBytes(card.path) ?? card.meta?.bytes,
        mtime_ms: mtimeMs(card.path) ?? card.mtime_ms,
        path_only: true,
      },
    };
  }

  // MCP / plugins / secret-bearing configs
  if (isPathOnlyCard(card)) {
    return {
      ...card,
      body: undefined,
      payload: {
        bytes: fileBytes(card.path) ?? card.meta?.bytes,
        mtime_ms: mtimeMs(card.path) ?? card.mtime_ms,
        path_only: true,
        refused: "path_only_or_secrets",
      },
    };
  }

  // agent.3md skill plane body
  if (
    kind === "skills" &&
    card.host === "agent3md" &&
    typeof card.meta?.z === "number"
  ) {
    const text = readTextFile(card.path, ctx.policy, MAX_BODY_BYTES);
    if (!text) {
      throw new LetError("not_found", `Cannot read agent.3md at ${card.path}`, {
        path: card.path,
      });
    }
    try {
      const agent = new Agent(text);
      const skill = agent.get(card.name);
      if (!skill) {
        throw new LetError(
          "not_found",
          `Skill plane "${card.name}" missing in ${card.path}`,
          { name: card.name, path: card.path },
        );
      }
      return {
        ...card,
        body: skill.body,
        payload: {
          z: skill.z,
          tool: skill.tool,
          triggers: skill.triggers,
          inputs: skill.inputs,
          format: "agent.3md",
        },
      };
    } catch (err) {
      if (err instanceof LetError) {
        throw err;
      }
      throw new LetError(
        "internal",
        err instanceof Error ? err.message : String(err),
        { path: card.path },
      );
    }
  }

  // agent.3md agent document: identity + skill catalog (not full all bodies)
  if (kind === "agents" && card.host === "agent3md") {
    const text = readTextFile(card.path, ctx.policy, MAX_BODY_BYTES);
    if (!text) {
      throw new LetError("not_found", `Cannot read ${card.path}`, {
        path: card.path,
      });
    }
    try {
      const agent = new Agent(text);
      const m = agent.manifest();
      return {
        ...card,
        body: m.identity,
        payload: {
          format: "agent.3md",
          agent: m.name,
          model: m.model,
          tools: m.tools,
          persona: m.persona,
          skills: m.skills,
        },
      };
    } catch (err) {
      throw new LetError(
        "internal",
        err instanceof Error ? err.message : String(err),
        { path: card.path },
      );
    }
  }

  // Worktree: cheap enrichment, no file body of the whole tree
  if (kind === "worktrees") {
    const branch = gitBranch(card.path);
    const head = gitHead(card.path);
    const top = gitToplevel(card.path);
    return {
      ...card,
      body: undefined,
      payload: {
        branch: branch ?? card.branch,
        head: head ?? card.meta?.head,
        git_toplevel: top,
        exists: pathExists(card.path),
      },
    };
  }

  // Default: file body from card.path
  if (!pathExists(card.path)) {
    throw new LetError("not_found", `Path missing: ${card.path}`, {
      path: card.path,
    });
  }
  if (isSessionLikePath(card.path)) {
    return {
      ...card,
      body: undefined,
      payload: {
        bytes: fileBytes(card.path),
        mtime_ms: mtimeMs(card.path),
        path_only: true,
        refused: "session_or_jsonl",
      },
    };
  }

  const loaded = loadTextBody(card.path, ctx, MAX_BODY_BYTES);
  return {
    ...card,
    body: loaded.body,
    truncated_body: loaded.truncated_body,
    payload: {
      bytes: loaded.bytes,
      mtime_ms: mtimeMs(card.path),
    },
  };
}

export type OpenResult = {
  path: string;
  kind: string;
  host: string;
  card?: IndexCard;
  body?: string;
  payload: Record<string, unknown>;
  refused?: string;
};

/**
 * Open a filesystem path: classify + optional small preview.
 * Never loads session jsonl bodies.
 */
export async function openPath(
  target: string,
  ctx: ScanContext,
): Promise<OpenResult> {
  const rp = safeRealpath(target) ?? target;
  if (!pathExists(rp)) {
    throw new LetError("not_found", `Path not found: ${target}`, {
      path: target,
    });
  }

  // Prefer agents before skills for .3md: many skill planes share one path
  // and would conflict if skills is resolved first.
  const is3md = rp.endsWith(".3md");
  const kinds: FindKind[] = is3md
    ? [
        "agents",
        "skills",
        "instructions",
        "worktrees",
        "commands",
        "mcp",
        "plugins",
        "workflows",
        "superskills",
        "memory",
        "tasks",
      ]
    : [
        "skills",
        "agents",
        "instructions",
        "worktrees",
        "commands",
        "mcp",
        "plugins",
        "workflows",
        "superskills",
        "memory",
        "tasks",
      ];
  for (const kind of kinds) {
    try {
      const card = await resolveCard(kind, rp, ctx);
      if (
        kind === "sessions" ||
        kind === "memory" ||
        isSessionLikePath(card.path) ||
        isPathOnlyCard(card)
      ) {
        return {
          path: rp,
          kind,
          host: card.host,
          card,
          body: undefined,
          payload: {
            bytes: fileBytes(rp),
            mtime_ms: mtimeMs(rp),
            path_only: true,
          },
          refused: isPathOnlyCard(card)
            ? "path_only_or_secrets"
            : "session_or_jsonl",
        };
      }
      if (kind === "worktrees") {
        const shown = await showAsset("worktrees", card.id, ctx);
        return {
          path: rp,
          kind,
          host: card.host,
          card,
          payload: shown.payload ?? {},
        };
      }
      // agent.3md document: identity + skill catalog (not raw full file dump)
      if (kind === "agents" && card.host === "agent3md") {
        const shown = await showAsset("agents", card.id, ctx);
        const preview = shown.body?.slice(0, MAX_OPEN_PREVIEW_BYTES);
        return {
          path: rp,
          kind,
          host: card.host,
          card,
          body: preview,
          payload: {
            ...(shown.payload ?? {}),
            preview_bytes: preview?.length ?? 0,
            full_via: `let show agents ${card.id}`,
          },
        };
      }
      if (kind === "skills" && card.host === "agent3md") {
        const shown = await showAsset("skills", card.id, ctx);
        const preview = shown.body?.slice(0, MAX_OPEN_PREVIEW_BYTES);
        return {
          path: rp,
          kind,
          host: card.host,
          card,
          body: preview,
          payload: {
            ...(shown.payload ?? {}),
            preview_bytes: preview?.length ?? 0,
            full_via: `let show skills ${card.id}`,
          },
        };
      }
      const loaded = loadTextBody(rp, ctx, MAX_OPEN_PREVIEW_BYTES);
      return {
        path: rp,
        kind,
        host: card.host,
        card,
        body: loaded.body,
        payload: {
          bytes: loaded.bytes,
          mtime_ms: mtimeMs(rp),
          truncated_body: loaded.truncated_body,
        },
      };
    } catch (err) {
      if (err instanceof LetError && err.code === "not_found") {
        continue;
      }
      if (err instanceof LetError && err.code === "conflict") {
        // path matched multiple — try next kind (e.g. skills share agent.3md path)
        continue;
      }
      throw err;
    }
  }

  // Unknown path: classify lightly
  if (isSessionLikePath(rp) || isDeniedBasename(basename(rp), ctx.policy)) {
    return {
      path: rp,
      kind: "file",
      host: "unknown",
      body: undefined,
      payload: {
        bytes: fileBytes(rp),
        mtime_ms: mtimeMs(rp),
        path_only: true,
      },
      refused: isSessionLikePath(rp) ? "session_or_jsonl" : "denied_basename",
    };
  }

  const loaded = loadTextBody(rp, ctx, MAX_OPEN_PREVIEW_BYTES);
  return {
    path: rp,
    kind: "file",
    host: "unknown",
    body: loaded.body,
    payload: {
      bytes: loaded.bytes,
      mtime_ms: mtimeMs(rp),
      truncated_body: loaded.truncated_body,
    },
  };
}
