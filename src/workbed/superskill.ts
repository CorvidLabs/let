/**
 * Superskills — TOML (or markdown) under .let/superskills/
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { LetError } from "../errors.ts";
import { isDirectory, pathExists } from "../fs-scan.ts";
import { homeDir, projectLetDir } from "../paths.ts";

export type SuperskillCard = {
  name: string;
  path: string;
  scope: "project" | "user";
  description?: string;
  steps?: string[];
  body?: string;
};

function superskillDirs(
  scope: "project" | "user" | "all",
  repoRoot: string | null,
): { dir: string; scope: "project" | "user" }[] {
  const out: { dir: string; scope: "project" | "user" }[] = [];
  if ((scope === "project" || scope === "all") && repoRoot) {
    out.push({
      dir: join(projectLetDir(repoRoot), "superskills"),
      scope: "project",
    });
  }
  if (scope === "user" || scope === "all") {
    out.push({ dir: join(homeDir(), ".let", "superskills"), scope: "user" });
  }
  return out;
}

/** Minimal TOML-ish extract: description = "..." and steps = ["a","b"] */
function parseLite(text: string): { description?: string; steps?: string[] } {
  const description = text.match(/description\s*=\s*"([^"]*)"/)?.[1];
  const steps: string[] = [];
  const stepsBlock = text.match(/steps\s*=\s*\[([\s\S]*?)\]/);
  if (stepsBlock?.[1]) {
    for (const m of stepsBlock[1].matchAll(/"([^"]+)"/g)) {
      if (m[1]) {
        steps.push(m[1]);
      }
    }
  }
  return { description, steps: steps.length ? steps : undefined };
}

export function listSuperskills(
  scope: "project" | "user" | "all",
  repoRoot: string | null,
): SuperskillCard[] {
  const cards: SuperskillCard[] = [];
  for (const { dir, scope: sc } of superskillDirs(scope, repoRoot)) {
    if (!isDirectory(dir)) {
      continue;
    }
    for (const name of readdirSync(dir)) {
      if (
        !name.endsWith(".toml") &&
        !name.endsWith(".md") &&
        !name.endsWith(".3md")
      ) {
        continue;
      }
      const p = join(dir, name);
      let description: string | undefined;
      let steps: string[] | undefined;
      try {
        const text = readFileSync(p, "utf8");
        const lite = parseLite(text);
        description = lite.description;
        steps = lite.steps;
      } catch {
        // skip body
      }
      cards.push({
        name: basename(name).replace(/\.(toml|md|3md)$/, ""),
        path: p,
        scope: sc,
        description,
        steps,
      });
    }
  }
  return cards.sort((a, b) => a.name.localeCompare(b.name));
}

export function getSuperskill(
  name: string,
  scope: "project" | "user" | "all",
  repoRoot: string | null,
): SuperskillCard {
  const all = listSuperskills(scope, repoRoot);
  const hits = all.filter(
    (c) => c.name === name || c.name.toLowerCase() === name.toLowerCase(),
  );
  if (hits.length === 0) {
    throw new LetError("not_found", `Superskill not found: ${name}`, { name });
  }
  if (hits.length > 1) {
    throw new LetError("conflict", `Multiple superskills named ${name}`, {
      candidates: hits.map((h) => h.path),
    });
  }
  const card = hits[0];
  if (!card) {
    throw new LetError("not_found", `Superskill not found: ${name}`, { name });
  }
  try {
    card.body = readFileSync(card.path, "utf8");
  } catch {
    // omit
  }
  return card;
}

export function writeExampleSuperskill(repoRoot: string): SuperskillCard {
  const dir = join(projectLetDir(repoRoot), "superskills");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "example-locate.toml");
  if (!pathExists(path)) {
    writeFileSync(
      path,
      `name = "example-locate"
description = "Example superskill: doctor then find worktrees"
steps = [
  "let doctor --json",
  "let find worktrees --json",
  "let where . --json"
]
`,
      "utf8",
    );
  }
  return getSuperskill("example-locate", "project", repoRoot);
}
