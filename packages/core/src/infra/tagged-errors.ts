import { Data } from "effect";

/*
 * Every tag carries a stable, unique `code` literal. Codes are public API
 * contract (API body `data.code`, CLI envelope): never rename one once
 * released. See docs/reference/contracts/README.md#error-taxonomy.
 */
/** Longest id text a `NotFoundError` echoes (a UUID is 36 characters). */
export const MAX_ECHOED_ID_CHARS = 64;

/**
 * A caller-supplied id as it may be echoed in a response or a log line:
 * trimmed and cut to {@link MAX_ECHOED_ID_CHARS}, so a hostile or huge string
 * cannot ride along in an error.
 */
export function boundEchoedId(value: string): string {
  return value.trim().slice(0, MAX_ECHOED_ID_CHARS);
}

/** Domain nouns a `NotFoundError` can name (GLOSSARY.md capitalisation). */
export const NOT_FOUND_ENTITIES = [
  "Capability",
  "Case",
  "Claim",
  "Credential",
  "Edge",
  "Entity",
  "Event",
  "Evidence",
  "Identifier",
  "Job",
  "Playbook",
  "Playbook run",
  "Proposal",
  "Question",
  "Task",
] as const;

export type NotFoundEntity = (typeof NOT_FOUND_ENTITIES)[number];

/**
 * A record the caller named does not exist (or is not visible to them: a
 * foreign-organization Case is indistinguishable from a missing one). `id` is
 * the value the caller supplied. The safe message is derived here, once.
 */
export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly entity: NotFoundEntity;
  readonly id: string;
}> {
  readonly code = "not_found" as const;

  override get message(): string {
    return `${this.entity} not found`;
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
  /** Detail for server-side logs only (never sent to the client). */
  readonly cause?: unknown;
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
