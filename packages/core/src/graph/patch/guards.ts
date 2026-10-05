import { Effect } from "effect";

import {
  casesRepo,
  entitiesRepo,
  evidenceRepo,
  type DbExec,
} from "@watchdog/db";
import { confirmedEvidenceViolation } from "@watchdog/policy";
import {
  type ConfidenceTier,
  type CaseId,
  parseTrimmedCaseId,
  parseTrimmedUuid,
} from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { tryDbOn } from "../../infra/postgres-effect";
import {
  InternalError,
  InvalidError,
  NotFoundError,
  type DomainTag,
  type NotFoundEntity,
} from "../../infra/tagged-errors";

/** Trim a graph id or fail not_found — use before repo queries that key on the id. */
export function requireTrimmedGraphId(
  value: string,
  entity: NotFoundEntity
): Effect.Effect<string, DomainTag> {
  const trimmed = parseTrimmedUuid(value);
  if (trimmed === null) {
    return new NotFoundError({ entity, id: value });
  }
  return Effect.succeed(trimmed);
}

/** Trim a Case id or fail not_found. */
export function requireTrimmedCaseIdEffect(
  value: string
): Effect.Effect<CaseId, DomainTag> {
  const trimmed = parseTrimmedCaseId(value);
  if (trimmed === null) {
    return new NotFoundError({ entity: "Case", id: value });
  }
  return Effect.succeed(trimmed);
}

/**
 * Existence-only check for trusted worker/export paths where the case id
 * already came from a job or child row. Prefer {@link assertCaseInOrgEffect}
 * on API / actor-facing entrypoints.
 */
export function assertCaseExistsUncheckedEffect(
  caseId: string,
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
  caseId: string,
  organizationId: string,
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
  caseId: string,
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
  caseId: string,
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

export function assertEvidenceLinkedEffect(
  linked: boolean
): Effect.Effect<void, DomainTag> {
  if (!linked) {
    return new InternalError({ reason: "Failed to link evidence" });
  }
  return Effect.void;
}
