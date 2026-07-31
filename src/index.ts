/**
 * @corvidlabs/let — public library exports.
 */

export {
  buildContext,
  type ContextPack,
  type ContextResult,
} from "./catalog/context.ts";
export { buildScanContext } from "./catalog/context-builder.ts";
export { type FindResult, findAssets } from "./catalog/find.ts";
export {
  findAgent3mdAgents,
  findAgent3mdSkills,
} from "./catalog/agent3md.ts";
export { attributeHost, federateWorktrees } from "./catalog/merge.ts";
export {
  FIND_KINDS,
  type FindKind,
  type FindScope,
  type HostId,
  type IndexCard,
  isFindKind,
  isFindScope,
  type WorktreeCard,
  type WorktreeStatus,
} from "./catalog/types.ts";
export { type WhereResult, whereAmI } from "./catalog/where.ts";
export {
  DEFAULT_CONFIG,
  DEFAULT_LIMIT,
  type LetConfig,
  type LoadedConfig,
  loadConfig,
  MAX_LIMIT,
  projectConfigPath,
  userConfigPath,
} from "./config.ts";
export { type DoctorCheck, type DoctorReport, runDoctor } from "./doctor.ts";
export {
  baseMeta,
  type Envelope,
  type EnvelopeMeta,
  type ErrorEnvelope,
  errorEnvelope,
  LET_VERSION,
  type SuccessEnvelope,
  successEnvelope,
  withEnvelope,
} from "./envelope.ts";
export {
  isLetError,
  LetError,
  type LetErrorCode,
  toLetError,
} from "./errors.ts";
export {
  gitCommonDir,
  gitToplevel,
  gitWorktreeList,
} from "./git.ts";
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
