import { Data } from "effect";

import { STALE_VERSION_MESSAGE_SUFFIX } from "@watchdog/schemas/shared";

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

/** Domain nouns a `NotFoundError` can name (docs/glossary.md capitalisation). */
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

/** Graph rows that carry a `version` (optimistic concurrency, #307). */
export const VERSIONED_ENTITIES = [
  "Claim",
  "Edge",
  "Entity",
  "Event",
  "Identifier",
  "Question",
] as const;

export type VersionedEntity = (typeof VERSIONED_ENTITIES)[number];

/**
 * An update named the version of a Graph row the caller last read, and the row has
 * moved on (another writer saved first). Nothing was written. `currentVersion` is
 * the row's version now, so the caller can reload and retry; a row that is gone is a
 * `NotFoundError`, not this. Maps to 409 like `ConflictError`, with its own stable
 * `code` so a client can offer "reload" instead of a generic failure.
 */
export class StaleVersionError extends Data.TaggedError("StaleVersionError")<{
  readonly entity: VersionedEntity;
  readonly id: string;
  readonly currentVersion: number;
}> {
  readonly code = "stale_version" as const;

  override get message(): string {
    return `${this.entity} ${STALE_VERSION_MESSAGE_SUFFIX}`;
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
  | StaleVersionError
  | InvalidError
  | ForbiddenError
  | InternalError;

/** Union of every stable error code; one distinct literal per tag. */
export type DomainTagCode = DomainTag["code"];

export function isDomainTag(error: unknown): error is DomainTag {
  return (
    error instanceof NotFoundError ||
    error instanceof ConflictError ||
    error instanceof StaleVersionError ||
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
