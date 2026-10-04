import { Data } from "effect";

import { DomainError, type DomainErrorCode } from "./domain-error";

/*
 * Every tag carries a stable, unique `code` literal. Codes are public API
 * contract (API body `data.code`, CLI envelope): never rename one once
 * released. See docs/reference/contracts/README.md#error-taxonomy.
 */
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string;
}> {
  readonly code = "not_found" as const;
}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly reason: string;
}> {
  readonly code = "conflict" as const;
}

export class InvalidError extends Data.TaggedError("InvalidError")<{
  readonly reason: string;
}> {
  readonly code = "invalid" as const;
}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly reason: string;
}> {
  readonly code = "forbidden" as const;
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
}

export type DomainTag =
  | NotFoundError
  | ConflictError
  | InvalidError
  | ForbiddenError
  | InternalError;

/** Union of every stable error code; one distinct literal per tag. */
export type DomainTagCode = DomainTag["code"];

export function fromDomainError(error: DomainError): DomainTag {
  switch (error.code) {
    case "not_found": {
      return new NotFoundError({ resource: error.message });
    }
    case "conflict": {
      return new ConflictError({ reason: error.message });
    }
    case "invalid": {
      return new InvalidError({ reason: error.message });
    }
    case "forbidden": {
      return new ForbiddenError({ reason: error.message });
    }
    case "internal": {
      return new InternalError({
        reason: error.message,
        cause: error.cause,
      });
    }
    default: {
      const _exhaustive: never = error.code;
      return _exhaustive;
    }
  }
}

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
 * `Effect.tryPromise` catch mapper. Domain errors become tagged values;
 * anything else is rethrown so it lands as a defect, not `UnknownError`.
 */
export function mapDomainCatch(error: unknown): DomainTag {
  if (isDomainTag(error)) return error;
  if (DomainError.is(error)) return fromDomainError(error);
  throw error;
}

export function domainCodeOf(error: DomainTag): DomainErrorCode {
  return error.code;
}

export function domainMessageOf(error: DomainTag): string {
  switch (error._tag) {
    case "NotFoundError": {
      return error.resource;
    }
    case "ConflictError":
    case "InvalidError":
    case "ForbiddenError":
    case "InternalError": {
      return error.reason;
    }
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function toDomainError(error: DomainTag): DomainError {
  return new DomainError(
    domainCodeOf(error),
    domainMessageOf(error),
    error._tag === "InternalError" ? error.cause : undefined
  );
}
