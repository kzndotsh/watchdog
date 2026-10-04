import { Data } from "effect";

/*
 * Every tag carries a stable, unique `code` literal. Codes are public API
 * contract (API body `data.code`, CLI envelope): never rename one once
 * released. See docs/reference/contracts/README.md#error-taxonomy.
 */
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string;
}> {
  readonly code = "not_found" as const;

  override get message(): string {
    return this.resource;
  }
}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly reason: string;
}> {
  readonly code = "conflict" as const;

  override get message(): string {
    return this.reason;
  }
}

export class InvalidError extends Data.TaggedError("InvalidError")<{
  readonly reason: string;
}> {
  readonly code = "invalid" as const;

  override get message(): string {
    return this.reason;
  }
}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly reason: string;
}> {
  readonly code = "forbidden" as const;

  override get message(): string {
    return this.reason;
  }
}

/**
 * A server-side failure the caller cannot fix (failed write, queue driver
 * outage). `reason` and `cause` are for logs only; the API maps this to a
 * generic 500 and never forwards either to the client.
 */
export class InternalError extends Data.TaggedError("InternalError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {
  readonly code = "internal" as const;

  override get message(): string {
    return this.reason;
  }
}

export type DomainTag =
  | NotFoundError
  | ConflictError
  | InvalidError
  | ForbiddenError
  | InternalError;

/** Union of every stable error code; one distinct literal per tag. */
export type DomainTagCode = DomainTag["code"];

export function isDomainTag(error: unknown): error is DomainTag {
  return (
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof InvalidError ||
    error instanceof ForbiddenError ||
    error instanceof InternalError
  );
}

/**
 * `Effect.tryPromise` catch mapper. Tagged domain errors pass through;
 * anything else is rethrown so it lands as a defect, not `UnknownError`.
 */
export function mapDomainCatch(error: unknown): DomainTag {
  if (isDomainTag(error)) return error;
  throw error;
}

/** Safe user-facing text for a tag (`InternalError`: log-only reason). */
export function domainMessageOf(error: DomainTag): string {
  return error.message;
}
