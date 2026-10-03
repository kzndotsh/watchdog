import { Data } from "effect";

import { DomainError, type DomainErrorCode } from "./domain-error";

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly resource: string;
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly reason: string;
}> {}

export class InvalidError extends Data.TaggedError("InvalidError")<{
  readonly reason: string;
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly reason: string;
}> {}

/**
 * A server-side failure the caller cannot fix (failed write, queue driver
 * outage). `reason` and `cause` are for logs only; the API maps this to a
 * generic 500 and never forwards either to the client.
 */
export class InternalError extends Data.TaggedError("InternalError")<{
  readonly reason: string;
  readonly cause?: unknown;
}> {}

export type DomainTag =
  | NotFoundError
  | ConflictError
  | InvalidError
  | ForbiddenError
  | InternalError;

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
  switch (error._tag) {
    case "NotFoundError": {
      return "not_found";
    }
    case "ConflictError": {
      return "conflict";
    }
    case "InvalidError": {
      return "invalid";
    }
    case "ForbiddenError": {
      return "forbidden";
    }
    case "InternalError": {
      return "internal";
    }
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
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
