/**
 * JSON response envelope for CLI --json and MCP tool results.
 * Success and error share the same outer shape.
 */

import { type LetError, type LetErrorCode, toLetError } from "./errors.ts";

export const LET_VERSION = "0.2.0";

export type EnvelopeMeta = {
  version: string;
  cwd: string;
  duration_ms: number;
  adapters?: string[];
  truncated?: boolean;
  total?: number;
  [key: string]: unknown;
};

export type SuccessEnvelope<Data = unknown> = {
  ok: true;
  command: string;
  data: Data;
  meta: EnvelopeMeta;
};

export type ErrorEnvelope = {
  ok: false;
  command: string;
  error: {
    code: LetErrorCode;
    message: string;
    details: Record<string, unknown>;
  };
  meta: EnvelopeMeta;
};

export type Envelope<Data = unknown> = SuccessEnvelope<Data> | ErrorEnvelope;

export function baseMeta(
  startedAt: number,
  extras: Partial<EnvelopeMeta> = {},
): EnvelopeMeta {
  return {
    version: LET_VERSION,
    cwd: process.cwd(),
    duration_ms: Math.max(0, Date.now() - startedAt),
    ...extras,
  };
}

export function successEnvelope<Data>(
  command: string,
  data: Data,
  startedAt: number,
  extras: Partial<EnvelopeMeta> = {},
): SuccessEnvelope<Data> {
  return {
    ok: true,
    command,
    data,
    meta: baseMeta(startedAt, extras),
  };
}

export function errorEnvelope(
  command: string,
  err: LetError,
  startedAt: number,
  extras: Partial<EnvelopeMeta> = {},
): ErrorEnvelope {
  return {
    ok: false,
    command,
    error: err.toJSON(),
    meta: baseMeta(startedAt, extras),
  };
}

/** Run an async command body and always produce an envelope. */
export async function withEnvelope<Data>(
  command: string,
  body: () => Promise<Data> | Data,
  extras: Partial<EnvelopeMeta> = {},
): Promise<Envelope<Data>> {
  const startedAt = Date.now();
  try {
    const data = await body();
    return successEnvelope(command, data, startedAt, extras);
  } catch (err) {
    return errorEnvelope(command, toLetError(err), startedAt, extras);
  }
}

export function printEnvelope(envelope: Envelope, json: boolean): void {
  if (json || !envelope.ok) {
    // Always print machine-readable JSON on --json or errors when using envelope path.
    process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }
  // Human-ish fallback for non-json success: still JSON for v0 (agents first).
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
}
