/**
 * Catalog types for federated find/where/context.
 */

export type HostId =
  | "claude"
  | "grok"
  | "codex"
  | "cursor"
  | "gemini"
  | "kimi"
  | "git"
  | "project"
  | "corvid"
  | "let"
  | "agent3md"
  | "unknown";

export type FindKind =
  | "instructions"
  | "skills"
  | "agents"
  | "commands"
  | "worktrees"
  | "sessions"
  | "tasks"
  | "memory"
  | "mcp"
  | "plugins"
  | "workflows"
  | "superskills";

export const FIND_KINDS: readonly FindKind[] = [
  "instructions",
  "skills",
  "agents",
  "commands",
  "worktrees",
  "sessions",
  "tasks",
  "memory",
  "mcp",
  "plugins",
  "workflows",
  "superskills",
] as const;

export type FindScope = "project" | "user" | "all";

export type CardScope = "project" | "user" | "global";

export type WorktreeStatus =
  | "active"
  | "prunable"
  | "locked"
  | "unknown"
  | "missing";

/** Progressive-disclosure index card (no large bodies). */
export type IndexCard = {
  /** Stable identity: kind + content hash — NOT host-prefixed for worktrees. */
  id: string;
  kind: FindKind;
  host: HostId;
  name: string;
  path: string;
  scope: CardScope;
  description?: string;
  triggers?: string[];
  repo_root?: string;
  branch?: string;
  status?: WorktreeStatus | string;
  managed_by?: HostId;
  mtime_ms?: number;
  meta?: Record<string, unknown>;
};

export type WorktreeCard = IndexCard & {
  kind: "worktrees";
  status: WorktreeStatus;
  managed_by: HostId;
};

export function isFindKind(value: string): value is FindKind {
  return (FIND_KINDS as readonly string[]).includes(value);
}

export function isFindScope(value: string): value is FindScope {
  return value === "project" || value === "user" || value === "all";
}
