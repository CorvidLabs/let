/**
 * @corvidlabs/let — public library exports.
 */

export { LET_VERSION } from "./envelope.ts";
export {
  type Envelope,
  type EnvelopeMeta,
  type ErrorEnvelope,
  type SuccessEnvelope,
  baseMeta,
  errorEnvelope,
  successEnvelope,
  withEnvelope,
} from "./envelope.ts";
export {
  LetError,
  type LetErrorCode,
  isLetError,
  toLetError,
} from "./errors.ts";
export {
  type FindKind,
  type FindScope,
  type HostId,
  type IndexCard,
  type WorktreeCard,
  type WorktreeStatus,
  FIND_KINDS,
  isFindKind,
  isFindScope,
} from "./catalog/types.ts";
export {
  DEFAULT_CONFIG,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type LetConfig,
  type LoadedConfig,
  loadConfig,
  projectConfigPath,
  userConfigPath,
} from "./config.ts";
export { type DoctorCheck, type DoctorReport, runDoctor } from "./doctor.ts";
export {
  absPath,
  claudeHome,
  claudeProjectDir,
  codexHome,
  cursorHome,
  encodeClaudeProjectPath,
  grokHome,
  homeDir,
  projectClaudeDir,
  projectLetDir,
} from "./paths.ts";
export { buildScanContext } from "./catalog/context-builder.ts";
export { findAssets, type FindResult } from "./catalog/find.ts";
export { whereAmI, type WhereResult } from "./catalog/where.ts";
export {
  buildContext,
  type ContextPack,
  type ContextResult,
} from "./catalog/context.ts";
export { federateWorktrees, attributeHost } from "./catalog/merge.ts";
export {
  gitWorktreeList,
  gitToplevel,
  gitCommonDir,
} from "./git.ts";
