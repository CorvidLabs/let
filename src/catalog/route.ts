/**
 * Route a natural-language request to ranked skills (agent.3md + trigger catalogs).
 */

import { Agent } from "@corvidlabs/agent3md";
import type { ScanContext } from "../adapters/types.ts";
import { readTextFile } from "../fs-scan.ts";
import { findAssets } from "./find.ts";
import type { IndexCard } from "./types.ts";

/** Tokenize like agent.3md loaders: maximal runs of letters/digits, lowercased. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/**
 * Phrase match: every word in the phrase must appear in the request tokens.
 * Empty phrase never matches.
 */
export function phraseHits(
  requestTokens: Set<string>,
  triggers: string[],
): { score: number; hits: string[] } {
  const hits: string[] = [];
  for (const phrase of triggers) {
    const words = tokenize(phrase);
    if (words.length === 0) {
      continue;
    }
    if (words.every((w) => requestTokens.has(w))) {
      hits.push(phrase);
    }
  }
  return { score: hits.length, hits };
}

export type RouteHit = {
  rank: number;
  score: number;
  hits: string[];
  source: "agent3md" | "triggers" | "name";
  skill: IndexCard;
  /** Suggested follow-up: let show skill <id> */
  show: string;
  /** tool template when present (agent.3md or description) */
  tool?: string | null;
};

export type RouteResult = {
  query: string;
  total_skills: number;
  hits: RouteHit[];
  /** Empty when nothing matched */
  top?: RouteHit;
};

/**
 * Name/description fallback score.
 * Rejects single-token description noise (e.g. "find" matching every skill
 * that mentions "find" in a long description).
 */
function nameScore(query: string, card: IndexCard): number {
  const q = query.toLowerCase();
  const name = card.name.toLowerCase();
  if (name === q) {
    return 3;
  }
  if (
    name.includes(q) ||
    (q.length >= 3 && q.includes(name) && name.length >= 3)
  ) {
    return 2;
  }
  const tokens = tokenize(query);
  const nameTokens = new Set(tokenize(card.name));
  let nameHits = 0;
  for (const t of tokens) {
    if (nameTokens.has(t)) {
      nameHits++;
    }
  }
  if (nameHits > 0) {
    return nameHits;
  }
  // Description: significant tokens only (len >= 3); require all of them
  // when the query has 1–2 sig tokens, or a majority when longer.
  const desc = (card.description ?? "").toLowerCase();
  if (!desc) {
    return 0;
  }
  const significant = tokens.filter((t) => t.length >= 3);
  if (significant.length === 0) {
    return 0;
  }
  const descHits = significant.filter((t) => desc.includes(t));
  if (significant.length <= 2) {
    return descHits.length === significant.length ? 1 : 0;
  }
  const need = Math.ceil(significant.length * 0.6);
  return descHits.length >= need ? 1 : 0;
}

/**
 * Rank skills for a request string.
 * Preference: agent.3md Agent.route when available, else trigger phrases, else name/desc.
 */
export async function routeSkills(
  query: string,
  ctx: ScanContext,
  opts: { limit?: number; host?: string } = {},
): Promise<RouteResult> {
  const q = query.trim();
  const wide: ScanContext = { ...ctx, limit: 500 };
  const found = await findAssets("skills", wide, { host: opts.host });
  const cards = found.items;
  const requestTokens = new Set(tokenize(q));

  // Group agent.3md cards by file path for Agent.route
  const a3ByPath = new Map<string, IndexCard[]>();
  const other: IndexCard[] = [];
  for (const c of cards) {
    if (c.host === "agent3md") {
      const list = a3ByPath.get(c.path) ?? [];
      list.push(c);
      a3ByPath.set(c.path, list);
    } else {
      other.push(c);
    }
  }

  type Acc = {
    score: number;
    hits: string[];
    source: RouteHit["source"];
    skill: IndexCard;
    tool?: string | null;
  };
  const acc: Acc[] = [];

  for (const [path, pathCards] of a3ByPath) {
    const text = readTextFile(path, ctx.policy, 512_000);
    if (!text) {
      for (const c of pathCards) {
        const { score, hits } = phraseHits(requestTokens, c.triggers ?? []);
        if (score > 0) {
          acc.push({
            score,
            hits,
            source: "triggers",
            skill: c,
            tool: typeof c.meta?.tool === "string" ? c.meta.tool : null,
          });
        }
      }
      continue;
    }
    try {
      const agent = new Agent(text);
      const routed = agent.route(q);
      for (const r of routed) {
        const card =
          pathCards.find((c) => c.name === r.skill.name) ??
          pathCards.find((c) => c.meta?.z === r.skill.z);
        if (!card) {
          // skill from agent not in our card list (limit?) — synthesize light card
          continue;
        }
        acc.push({
          score: r.score,
          hits: r.hits,
          source: "agent3md",
          skill: card,
          tool: r.skill.tool,
        });
      }
    } catch {
      for (const c of pathCards) {
        const { score, hits } = phraseHits(requestTokens, c.triggers ?? []);
        if (score > 0) {
          acc.push({
            score,
            hits,
            source: "triggers",
            skill: c,
            tool: typeof c.meta?.tool === "string" ? c.meta.tool : null,
          });
        }
      }
    }
  }

  for (const c of other) {
    const triggers = c.triggers ?? [];
    if (triggers.length > 0) {
      const { score, hits } = phraseHits(requestTokens, triggers);
      if (score > 0) {
        acc.push({
          score,
          hits,
          source: "triggers",
          skill: c,
          tool: null,
        });
        continue;
      }
    }
    const ns = nameScore(q, c);
    if (ns > 0) {
      acc.push({
        score: ns,
        hits:
          ns >= 2
            ? [c.name]
            : tokenize(c.name).filter((t) => requestTokens.has(t)),
        source: "name",
        skill: c,
        tool: null,
      });
    }
  }

  // Dedupe by skill id (prefer higher score / agent3md)
  const best = new Map<string, Acc>();
  for (const a of acc) {
    const prev = best.get(a.skill.id);
    if (
      !prev ||
      a.score > prev.score ||
      (a.score === prev.score && a.source === "agent3md")
    ) {
      best.set(a.skill.id, a);
    }
  }

  const sourceRank = (s: RouteHit["source"]): number => {
    if (s === "agent3md") {
      return 0;
    }
    if (s === "triggers") {
      return 1;
    }
    return 2;
  };

  const sorted = [...best.values()].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Prefer agent.3md / triggers over weak name matches at equal score
    const src = sourceRank(a.source) - sourceRank(b.source);
    if (src !== 0) {
      return src;
    }
    // project-local first
    const aLocal = a.skill.scope === "project" ? 0 : 1;
    const bLocal = b.skill.scope === "project" ? 0 : 1;
    if (aLocal !== bLocal) {
      return aLocal - bLocal;
    }
    return a.skill.name.localeCompare(b.skill.name);
  });

  const limit = opts.limit ?? Math.min(ctx.limit, 20);
  const hits: RouteHit[] = sorted.slice(0, limit).map((a, i) => ({
    rank: i + 1,
    score: a.score,
    hits: a.hits,
    source: a.source,
    skill: a.skill,
    show: `let show skill ${a.skill.id}`,
    tool: a.tool,
  }));

  return {
    query: q,
    total_skills: cards.length,
    hits,
    top: hits[0],
  };
}
