import { Effect } from "effect";

import {
  casesRepo,
  entitiesRepo,
  evidenceRepo,
  type DbExec,
} from "@watchdog/db";
import { confirmedEvidenceViolation } from "@watchdog/policy";
import {
  parseTrimmedCaseId,
  parseTrimmedUuid,
  type CaseId,
  type ConfidenceTier,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDbOn } from "../../infra/postgres-effect";
import {
  boundEchoedId,
  ConflictError,
  InvalidError,
  NotFoundError,
  StaleVersionError,
  type DomainTag,
  type NotFoundEntity,
  type VersionedEntity,
} from "../../infra/tagged-errors";

/** Trim a graph id or fail not_found — use before repo queries that key on the id. */
export function requireTrimmedGraphId(
  value: string,
  entity: NotFoundEntity
): Effect.Effect<string, DomainTag> {
  const trimmed = parseTrimmedUuid(value);
  if (trimmed === null) {
    return new NotFoundError({ entity, id: boundEchoedId(value) });
  }
  return Effect.succeed(trimmed);
}

/**
 * A conditional UPDATE (the status check is in its WHERE) matched no row:
 * Conflict when the row still exists, so the condition failed (a concurrent
 * writer won), NotFound when it is gone. Call it with a re-read taken in the
 * same transaction.
 */
export function missedUpdateEffect(
  rowExists: boolean,
  target: { entity: NotFoundEntity; id: string },
  conflictReason: string
): Effect.Effect<never, NotFoundError | ConflictError> {
  return rowExists
    ? Effect.fail(new ConflictError({ reason: conflictReason }))
    : Effect.fail(new NotFoundError(target));
}

/**
 * A version-checked UPDATE (`WHERE id = $1 AND version = $2`, #307) matched no row.
 * `current` is a re-read taken in the same transaction: StaleVersion, carrying the
 * row's version now, when the row still exists (another writer saved first), NotFound
 * when it is gone. Nothing was written either way.
 */
export function missedVersionedUpdateEffect(
  current: { version: number } | null,
  target: { entity: VersionedEntity; id: string }
): Effect.Effect<never, NotFoundError | StaleVersionError> {
  return current === null
    ? Effect.fail(new NotFoundError(target))
    : Effect.fail(
        new StaleVersionError({ ...target, currentVersion: current.version })
      );
}

/** Trim a Case id or fail not_found. */
export function requireTrimmedCaseIdEffect(
  value: string
): Effect.Effect<CaseId, DomainTag> {
  const trimmed = parseTrimmedCaseId(value);
  if (trimmed === null) {
    return new NotFoundError({ entity: "Case", id: boundEchoedId(value) });
  }
  return Effect.succeed(trimmed);
}

/**
 * Existence-only check for trusted worker/export paths where the case id
 * already came from a job or child row. Prefer {@link assertCaseInOrgEffect}
 * on API / actor-facing entrypoints.
 */
export function assertCaseExistsUncheckedEffect(
  caseId: CaseId,
  exec?: DbExec
): Effect.Effect<CaseId, DomainTag, Db> {
  return Effect.gen(function* assertCaseExistsUncheckedGen() {
    const trimmedCaseId = yield* requireTrimmedCaseIdEffect(caseId);
    const row = yield* tryDbOn(exec, (handle) =>
      casesRepo.getByIdUnchecked(handle, trimmedCaseId)
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Case", id: trimmedCaseId });
    }
    return trimmedCaseId;
  });
}

/** Org-scoped case gate for API / actor-facing entrypoints. Returns trimmed case id. */
export function assertCaseInOrgEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  exec?: DbExec
): Effect.Effect<CaseId, DomainTag, Db> {
  return Effect.gen(function* assertCaseInOrgGen() {
    const trimmedCaseId = yield* requireTrimmedCaseIdEffect(caseId);
    const row = yield* tryDbOn(exec, (handle) =>
      casesRepo.getById(handle, trimmedCaseId, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ entity: "Case", id: trimmedCaseId });
    }
    return trimmedCaseId;
  });
}

export function assertEntityInCaseEffect(
  caseId: CaseId,
  entityId: string,
  exec?: DbExec
): Effect.Effect<string, DomainTag, Db> {
  return Effect.gen(function* assertEntityInCaseGen() {
    const trimmedCaseId = yield* requireTrimmedCaseIdEffect(caseId);
    const trimmedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    const row = yield* tryDbOn(exec, (handle) =>
      entitiesRepo.getInCase(handle, trimmedCaseId, trimmedEntityId)
    );
    if (!row) {
      return yield* new NotFoundError({
        entity: "Entity",
        id: trimmedEntityId,
      });
    }
    return trimmedEntityId;
  });
}

export function assertEvidenceInCaseEffect(
  caseId: CaseId,
  evidenceId: string,
  exec?: DbExec
): Effect.Effect<string, DomainTag, Db> {
  return Effect.gen(function* assertEvidenceInCaseGen() {
    const trimmedCaseId = yield* requireTrimmedCaseIdEffect(caseId);
    const trimmedEvidenceId = yield* requireTrimmedGraphId(
      evidenceId,
      "Evidence"
    );
    const row = yield* tryDbOn(exec, (handle) =>
      evidenceRepo.getActiveInCase(handle, trimmedCaseId, trimmedEvidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({
        entity: "Evidence",
        id: trimmedEvidenceId,
      });
    }
    return trimmedEvidenceId;
  });
}

export function assertConfidenceEvidenceEffect(
  confidence: ConfidenceTier,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  const reason = confirmedEvidenceViolation({
    confidence,
    evidenceCount: evidenceIds.length,
  });
  if (reason !== null) return new InvalidError({ reason });
  return Effect.void;
}
