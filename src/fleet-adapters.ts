/**
 * Fleet-only presentation adapters for Let session index cards.
 *
 * These adapters do not scan the filesystem. Let's catalog remains the source
 * of truth; Fleet only maps its indexed session cards into safe local detail.
 */

import type { IndexCard } from "./catalog/types.ts";

export type FleetProvider =
  | "Claude"
  | "Codex"
  | "Grok"
  | "Gemini"
  | "Antigravity";

export type FleetSessionDetail = {
  latestMessage: string | null;
  recentActivity: string[];
  detailAvailability: "available" | "unavailable";
  /** Internal-only local directory used to resolve safe project context. */
  contextPath: string | null;
};

export type FleetSessionAdapter = {
  readonly host: IndexCard["host"];
  readonly provider: FleetProvider;
  matches(card: IndexCard): boolean;
};

function isAntigravity(card: IndexCard): boolean {
  return String(card.meta?.source ?? "").startsWith("antigravity");
}

export const FLEET_SESSION_ADAPTERS: readonly FleetSessionAdapter[] = [
  {
    host: "codex",
    provider: "Codex",
    matches: (card) => card.host === "codex",
  },
  { host: "grok", provider: "Grok", matches: (card) => card.host === "grok" },
  {
    host: "claude",
    provider: "Claude",
    matches: (card) => card.host === "claude",
  },
  {
    host: "gemini",
    provider: "Antigravity",
    matches: (card) => card.host === "gemini" && isAntigravity(card),
  },
  {
    host: "gemini",
    provider: "Gemini",
    matches: (card) => card.host === "gemini",
  },
];

export function fleetAdapterFor(card: IndexCard): FleetSessionAdapter | null {
  return (
    FLEET_SESSION_ADAPTERS.find((adapter) => adapter.matches(card)) ?? null
  );
}

function sessionText(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(sessionText);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) =>
        /content|text|message|prompt|status|summary|output/i.test(key)
          ? sessionText(child)
          : [],
    );
  }
  return [];
}

function sessionContextPaths(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(sessionContextPaths);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, child]) => {
      if (
        typeof child === "string" &&
        /cwd|workdir|working[_-]?directory|workspace|repo[_-]?root|project[_-]?path/i.test(
          key,
        ) &&
        /^(?:\/Users|\/home)\//.test(child)
      ) {
        return [child];
      }
      return sessionContextPaths(child);
    },
  );
}

/** Extract bounded display text from a session file that Let already indexed. */
export function fleetSessionDetail(
  source: string | null,
  redact: (value: string) => string,
): FleetSessionDetail {
  if (!source) {
    return {
      latestMessage: null,
      recentActivity: [],
      detailAvailability: "unavailable",
      contextPath: null,
    };
  }
  let contextPath: string | null = null;
  const messages = source
    .split("\n")
    .flatMap((line) => {
      try {
        const value = JSON.parse(line);
        contextPath = sessionContextPaths(value).at(-1) ?? contextPath;
        return sessionText(value);
      } catch {
        return line.trim() ? [line] : [];
      }
    })
    .map((message) => redact(message.replace(/\s+/g, " ").trim()))
    .filter(Boolean)
    .map((message) => message.slice(0, 500))
    .slice(-8);
  return {
    latestMessage: messages.at(-1) ?? null,
    recentActivity: messages,
    detailAvailability: messages.length > 0 ? "available" : "unavailable",
    contextPath,
  };
}
