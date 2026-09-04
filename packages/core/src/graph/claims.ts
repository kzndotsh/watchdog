import { Effect } from "effect";

import { claimsRepo, db, evidenceLinksRepo, type ClaimRow } from "@watchdog/db";
import type {
  ClaimClass,
  ConfidenceTier,
  RetractKind,
} from "@watchdog/schemas";
import { normalizeIdList } from "@watchdog/schemas";

import { assertEvidenceIdsInCaseEffect } from "../evidence/evidence";
import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  ConflictError,
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import {
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
} from "./patch/guards";

export interface ClaimRecord {
  id: string;
  entityId: string;
  class: ClaimClass;
  text: string;
  confidence: ConfidenceTier;
  retracted: boolean;
  retractKind: RetractKind | null;
  retractedReason: string | null;
  retractedBy: string | null;
  retractedAt: string | null;
  evidenceIds: string[];
}

export interface CreateClaimInput {
  caseId: string;
  entityId: string;
  text: string;
  confidence: ConfidenceTier;
  class: ClaimClass;
  evidenceIds?: string[];
}

export interface UpdateClaimInput {
  caseId: string;
  claimId: string;
  text?: string;
  class?: ClaimClass;
  confidence?: ConfidenceTier;
  evidenceIds?: string[];
}

export interface RetractClaimInput {
  caseId: string;
  claimId: string;
  kind: RetractKind;
  reason: string;
}

function toRecord(row: ClaimRow, evidenceIds: string[]): ClaimRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    class: row.class,
    text: row.text,
    confidence: row.confidence,
    retracted: row.retracted,
    retractKind: row.retractKind ?? null,
    retractedReason: row.retractedReason ?? null,
    retractedBy: row.retractedBy ?? null,
    retractedAt: row.retractedAt?.toISOString() ?? null,
    evidenceIds,
  };
}

interface EntityListOpts {
  includeRetracted?: boolean;
}

export function listClaimsForEntityEffect(
  caseId: string,
  entityId: string,
  opts?: EntityListOpts
): Effect.Effect<ClaimRecord[], DomainTag> {
  return Effect.gen(function* listClaimsGen() {
    yield* assertEntityInCaseEffect(caseId, entityId, db);
    const rows = yield* tryDb(() =>
      claimsRepo.listForEntity(db, entityId, opts)
    );
    const byClaim = yield* tryDb(() =>
      evidenceLinksRepo.listForClaims(
        db,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) => toRecord(row, byClaim.get(row.id) ?? []));
  });
}

export function createClaimEffect(
  input: CreateClaimInput
): Effect.Effect<ClaimRecord, DomainTag> {
  return Effect.gen(function* createClaimGen() {
    const evidenceIds = normalizeIdList(input.evidenceIds ?? []);
    yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

    const row = yield* transact((tx) =>
      Effect.gen(function* createClaimTx() {
        yield* assertEntityInCaseEffect(input.caseId, input.entityId, tx);
        yield* assertEvidenceIdsInCaseEffect(input.caseId, evidenceIds, tx);

        const created = yield* tryDb(() =>
          claimsRepo.create(tx, {
            entityId: input.entityId,
            text: input.text,
            confidence: input.confidence,
            class: input.class,
          })
        );
        if (!created) {
          return yield* new InvalidError({
            reason: "Failed to create Claim",
          });
        }
        yield* tryDb(() =>
          evidenceLinksRepo.linkClaim(tx, created.id, evidenceIds)
        );
        return created;
      })
    );

    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row, evidenceIds);
  });
}

export function retractClaimEffect(
  input: RetractClaimInput,
  actorId: string
): Effect.Effect<ClaimRecord, DomainTag> {
  return Effect.gen(function* retractClaimGen() {
    const existing = yield* tryDb(() =>
      claimsRepo.getInCase(db, input.caseId, input.claimId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Claim not found" });
    }
    if (existing.retracted) {
      return yield* new ConflictError({ reason: "Claim already retracted" });
    }

    const row = yield* tryDb(() =>
      claimsRepo.retract(db, input.claimId, {
        retractKind: input.kind,
        retractedReason: input.reason,
        retractedBy: actorId,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to retract Claim" });
    }

    const byClaim = yield* tryDb(() =>
      evidenceLinksRepo.listForClaims(db, [row.id])
    );
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row, byClaim.get(row.id) ?? []);
  });
}

export function updateClaimEffect(
  input: UpdateClaimInput
): Effect.Effect<ClaimRecord, DomainTag> {
  return Effect.gen(function* updateClaimGen() {
    const existing = yield* tryDb(() =>
      claimsRepo.getInCase(db, input.caseId, input.claimId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Claim not found" });
    }

    const byClaim = yield* tryDb(() =>
      evidenceLinksRepo.listForClaims(db, [existing.id])
    );
    const evidenceIds = byClaim.get(existing.id) ?? [];

    if (
      input.text === undefined &&
      input.class === undefined &&
      input.confidence === undefined &&
      input.evidenceIds === undefined
    ) {
      return yield* new InvalidError({ reason: "Nothing to update" });
    }

    const { row, evidenceIds: nextEvidenceIds } = yield* transact((tx) =>
      Effect.gen(function* updateClaimTx() {
        let nextIds = evidenceIds;
        if (input.evidenceIds !== undefined) {
          nextIds = normalizeIdList(input.evidenceIds);
          yield* assertEvidenceIdsInCaseEffect(input.caseId, nextIds, tx);
          nextIds = yield* tryDb(() =>
            evidenceLinksRepo.replaceClaim(tx, existing.id, nextIds)
          );
        }

        const nextConfidence = input.confidence ?? existing.confidence;
        if (nextConfidence === "confirmed" && nextIds.length === 0) {
          return yield* new InvalidError({
            reason: "confirmed requires at least one Evidence attachment",
          });
        }

        const updated = yield* tryDb(() =>
          claimsRepo.update(tx, input.claimId, {
            ...(input.text === undefined ? {} : { text: input.text }),
            ...(input.class === undefined ? {} : { class: input.class }),
            ...(input.confidence === undefined
              ? {}
              : { confidence: input.confidence }),
          })
        );
        if (!updated) {
          return yield* new InvalidError({
            reason: "Failed to update Claim",
          });
        }
        return { row: updated, evidenceIds: nextIds };
      })
    );

    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(row, nextEvidenceIds);
  });
}
