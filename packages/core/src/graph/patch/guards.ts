import { Effect } from "effect";

import {
  casesRepo,
  db,
  entitiesRepo,
  evidenceRepo,
  type DbExec,
} from "@watchdog/db";
import type { ConfidenceTier } from "@watchdog/schemas";

import { tryDb } from "../../infra/postgres-effect";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../../infra/tagged-errors";

export function assertCaseExistsEffect(
  caseId: string,
  exec: DbExec = db
): Effect.Effect<void, DomainTag> {
  return tryDb(() => casesRepo.getById(exec, caseId)).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.void
        : new NotFoundError({ resource: "Case not found" })
    )
  );
}

export function assertEntityInCaseEffect(
  caseId: string,
  entityId: string,
  exec: DbExec = db
): Effect.Effect<void, DomainTag> {
  return tryDb(() => entitiesRepo.getInCase(exec, caseId, entityId)).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.void
        : new NotFoundError({ resource: "Entity not found in this Case" })
    )
  );
}

export function assertEvidenceInCaseEffect(
  caseId: string,
  evidenceId: string,
  exec: DbExec = db
): Effect.Effect<void, DomainTag> {
  return tryDb(() =>
    evidenceRepo.getActiveInCase(exec, caseId, evidenceId)
  ).pipe(
    Effect.flatMap((row) =>
      row
        ? Effect.void
        : new NotFoundError({ resource: "Evidence not found in this Case" })
    )
  );
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
