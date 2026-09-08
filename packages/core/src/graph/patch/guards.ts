import { Effect } from "effect";

import {
  casesRepo,
  db,
  entitiesRepo,
  evidenceRepo,
  type DbExec,
} from "@watchdog/db";
import type { ConfidenceTier } from "@watchdog/schemas";
import { parseTrimmedCaseId } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";

function requireTrimmedId(
  value: string,
  notFoundResource: string
): Effect.Effect<string, DomainTag> {
  const trimmed = parseTrimmedCaseId(value);
  if (trimmed === null) {
    return new NotFoundError({ resource: notFoundResource });
  }
  return Effect.succeed(trimmed);
}

/** Trim a graph id or fail not_found — use before repo queries that key on the id. */
export function requireTrimmedGraphId(
  value: string,
  notFoundResource: string
): Effect.Effect<string, DomainTag> {
  return requireTrimmedId(value, notFoundResource);
}

/**
 * Existence-only check for trusted worker/export paths where the case id
 * already came from a job or child row. Prefer {@link assertCaseInOrgEffect}
 * on API / actor-facing entrypoints.
 */
export function assertCaseExistsUncheckedEffect(
  caseId: string,
  exec: DbExec = db
): Effect.Effect<string, DomainTag> {
  return Effect.gen(function* assertCaseExistsUncheckedGen() {
    const trimmedCaseId = yield* requireTrimmedId(caseId, "Case not found");
    const row = yield* tryDb(() =>
      casesRepo.getByIdUnchecked(exec, trimmedCaseId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Case not found" });
    }
    return trimmedCaseId;
  });
}

/** Org-scoped case gate for API / actor-facing entrypoints. Returns trimmed case id. */
export function assertCaseInOrgEffect(
  caseId: string,
  organizationId: string,
  exec: DbExec = db
): Effect.Effect<string, DomainTag> {
  return Effect.gen(function* assertCaseInOrgGen() {
    const trimmedCaseId = yield* requireTrimmedId(caseId, "Case not found");
    const row = yield* tryDb(() =>
      casesRepo.getById(exec, trimmedCaseId, organizationId)
    );
    if (!row) {
      return yield* new NotFoundError({ resource: "Case not found" });
    }
    return trimmedCaseId;
  });
}

export function assertEntityInCaseEffect(
  caseId: string,
  entityId: string,
  exec: DbExec = db
): Effect.Effect<string, DomainTag> {
  return Effect.gen(function* assertEntityInCaseGen() {
    const trimmedCaseId = yield* requireTrimmedId(caseId, "Case not found");
    const trimmedEntityId = yield* requireTrimmedId(
      entityId,
      "Entity not found in this Case"
    );
    const row = yield* tryDb(() =>
      entitiesRepo.getInCase(exec, trimmedCaseId, trimmedEntityId)
    );
    if (!row) {
      return yield* new NotFoundError({
        resource: "Entity not found in this Case",
      });
    }
    return trimmedEntityId;
  });
}

export function assertEvidenceInCaseEffect(
  caseId: string,
  evidenceId: string,
  exec: DbExec = db
): Effect.Effect<string, DomainTag> {
  return Effect.gen(function* assertEvidenceInCaseGen() {
    const trimmedCaseId = yield* requireTrimmedId(caseId, "Case not found");
    const trimmedEvidenceId = yield* requireTrimmedId(
      evidenceId,
      "Evidence not found in this Case"
    );
    const row = yield* tryDb(() =>
      evidenceRepo.getActiveInCase(exec, trimmedCaseId, trimmedEvidenceId)
    );
    if (!row) {
      return yield* new NotFoundError({
        resource: "Evidence not found in this Case",
      });
    }
    return trimmedEvidenceId;
  });
}

export function assertConfidenceEvidenceEffect(
  confidence: ConfidenceTier,
  evidenceIds: string[]
): Effect.Effect<void, DomainTag> {
  if (confidence === "confirmed" && evidenceIds.length === 0) {
    return new InvalidError({
      reason: "confirmed requires at least one Evidence attachment",
    });
  }
  return Effect.void;
}

export function assertEvidenceLinkedEffect(
  linked: boolean
): Effect.Effect<void, DomainTag> {
  if (!linked) {
    return new InvalidError({ reason: "Failed to link evidence" });
  }
  return Effect.void;
}
