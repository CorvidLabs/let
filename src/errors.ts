/**
 * LetError — typed errors for CLI, library, and MCP surfaces.
 * See docs/design.md § JSON envelope + error mapping.
 */

export type LetErrorCode =
  | "usage"
  | "validation"
  | "not_found"
  | "conflict"
  | "unsafe"
  | "dependency"
  | "internal";

export class LetError extends Error {
  public readonly code: LetErrorCode;
  public readonly details: Record<string, unknown>;

  public constructor(
    code: LetErrorCode,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "LetError";
    this.code = code;
    this.details = details;
  }

  /** CLI process exit code for this error. */
  public get exitCode(): number {
    switch (this.code) {
      case "usage":
      case "validation":
        return 1;
      case "not_found":
        return 2;
      case "conflict":
      case "unsafe":
        return 3;
      case "dependency":
        return 4;
      case "internal":
        return 10;
      default: {
        const _exhaustive: never = this.code;
        void _exhaustive;
        return 10;
      }
    }
  }

  public toJSON(): {
    code: LetErrorCode;
    message: string;
    details: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

export function isLetError(value: unknown): value is LetError {
  return value instanceof LetError;
}

/** Map unknown throwables into LetError for envelope wrapping. */
export function toLetError(err: unknown): LetError {
  if (isLetError(err)) {
    return err;
  }
  if (err instanceof Error) {
    return new LetError("internal", err.message, { name: err.name });
  }
  return new LetError("internal", String(err));
}
