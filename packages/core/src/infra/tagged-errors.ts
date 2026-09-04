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

export type DomainTag =
  | NotFoundError
  | ConflictError
  | InvalidError
  | ForbiddenError;

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
    error instanceof ForbiddenError
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
    case "ForbiddenError": {
      return error.reason;
    }
    default: {
      const _exhaustive: never = error;
      return _exhaustive;
    }
  }
}

export function toDomainError(error: DomainTag): DomainError {
  return new DomainError(domainCodeOf(error), domainMessageOf(error));
}
