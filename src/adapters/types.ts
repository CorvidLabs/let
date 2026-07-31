/**
 * Host adapter contract.
 */

import type { LetConfig } from "../config.ts";
import type { ScanPolicy } from "../catalog/scan-policy.ts";
import type {
  FindKind,
  FindScope,
  HostId,
  IndexCard,
} from "../catalog/types.ts";

export type ScanContext = {
  cwd: string;
  repoRoot: string | null;
  repoCommonDir: string | null;
  home: string;
  config: LetConfig;
  scope: FindScope;
  targetPath?: string;
  policy: ScanPolicy;
  limit: number;
  /** Set of realpaths from git porcelain for this repo (filled by merge). */
  gitPorcelainPaths?: Set<string>;
};

export type HostAdapter = {
  readonly id: HostId;
  kinds(): FindKind[];
  /** Emit cards. Never throws for missing dirs. Never writes. */
  find(kind: FindKind, ctx: ScanContext): Promise<IndexCard[]>;
};
