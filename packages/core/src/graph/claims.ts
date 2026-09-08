import { Effect } from "effect";

import { claimsRepo, db, evidenceLinksRepo, type ClaimRow } from "@watchdog/db";
import type {
  ClaimClass,
  ConfidenceTier,
  RetractKind,
} from "@watchdog/schemas";
import { normalizeUuidList, trimmedOrUndefined } from "@watchdog/schemas";

import { requireActorIdEffect } from "../actors/require-actor-id";
import {
  assertEvidenceIdsInCaseEffect,
  parseGraphEvidenceIdsEffect,
} from "../evidence/evidence";
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
  assertCaseInOrgEffect,
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
  assertEvidenceLinkedEffect,
  requireTrimmedGraphId,
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
  organizationId: string;
  entityId: string;
  text: string;
  confidence: ConfidenceTier;
  class: ClaimClass;
  evidenceIds?: string[];
}

export interface UpdateClaimInput {
  caseId: string;
  organizationId: string;
  claimId: string;
  text?: string;
  class?: ClaimClass;
  confidence?: ConfidenceTier;
  evidenceIds?: string[];
}

export interface RetractClaimInput {
  caseId: string;
  organizationId: string;
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
    evidenceIds: normalizeUuidList(evidenceIds),
  };
}

interface EntityListOpts {
  includeRetracted?: boolean;
}

export function listClaimsForEntityEffect(
  caseId: string,
  organizationId: string,
  entityId: string,
  opts?: EntityListOpts
): Effect.Effect<ClaimRecord[], DomainTag> {
  return Effect.gen(function* listClaimsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(
      entityId,
      "Entity not found in this Case"
    );
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId, db);
    const rows = yield* tryDb(() =>
      claimsRepo.listForEntity(db, normalizedEntityId, opts)
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
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = yield* requireTrimmedGraphId(
      input.entityId,
      "Entity not found in this Case"
    );
    const text = trimmedOrUndefined(input.text);
    if (text === undefined) {
      return yield* new InvalidError({ reason: "Claim text is required" });
    }
    const evidenceIds = yield* parseGraphEvidenceIdsEffect(input.evidenceIds ?? []);
    yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

    const row = yield* transact((tx) =>
      Effect.gen(function* createClaimTx() {
        yield* assertEntityInCaseEffect(scopedCaseId, entityId, tx);
        yield* assertEvidenceIdsInCaseEffect(scopedCaseId, evidenceIds, tx);

        const created = yield* tryDb(() =>
          claimsRepo.create(tx, {
            entityId,
            text,
            confidence: input.confidence,
            class: input.class,
          })
        );
        if (!created) {
          return yield* new InvalidError({
            reason: "Failed to create Claim",
          });
        }
        const linked = yield* tryDb(() =>
          evidenceLinksRepo.linkClaim(tx, created.id, evidenceIds)
        );
        yield* assertEvidenceLinkedEffect(linked);
        return created;
      })
    );

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row, evidenceIds);
  });
}

export function retractClaimEffect(
  input: RetractClaimInput,
  actorId: string
): Effect.Effect<ClaimRecord, DomainTag> {
  return Effect.gen(function* retractClaimGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const claimId = yield* requireTrimmedGraphId(
      input.claimId,
      "Claim not found"
    );
    const reason = trimmedOrUndefined(input.reason);
    if (reason === undefined) {
      return yield* new InvalidError({
        reason: "Retraction reason is required",
      });
    }
    const existing = yield* tryDb(() =>
      claimsRepo.getInCase(db, scopedCaseId, claimId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Claim not found" });
    }
    if (existing.retracted) {
      return yield* new ConflictError({ reason: "Claim already retracted" });
    }

    const scopedActorId = yield* requireActorIdEffect(actorId);
    const row = yield* tryDb(() =>
      claimsRepo.retractInCase(db, scopedCaseId, claimId, {
        retractKind: input.kind,
        retractedReason: reason,
        retractedBy: scopedActorId,
      })
    );
    if (!row) {
      return yield* new InvalidError({ reason: "Failed to retract Claim" });
    }

    const byClaim = yield* tryDb(() =>
      evidenceLinksRepo.listForClaims(db, [row.id])
    );
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row, byClaim.get(row.id) ?? []);
  });
}

export function updateClaimEffect(
  input: UpdateClaimInput
): Effect.Effect<ClaimRecord, DomainTag> {
  return Effect.gen(function* updateClaimGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const claimId = yield* requireTrimmedGraphId(
      input.claimId,
      "Claim not found"
    );
    const existing = yield* tryDb(() =>
      claimsRepo.getInCase(db, scopedCaseId, claimId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Claim not found" });
    }
    if (existing.retracted) {
      return yield* new ConflictError({ reason: "Claim already retracted" });
    }

    if (
      input.text === undefined &&
      input.class === undefined &&
      input.confidence === undefined &&
      input.evidenceIds === undefined
    ) {
      return yield* new InvalidError({ reason: "Nothing to update" });
    }

    const nextText =
      input.text === undefined ? undefined : trimmedOrUndefined(input.text);
    if (input.text !== undefined && nextText === undefined) {
      return yield* new InvalidError({ reason: "Claim text is required" });
    }

    const { row, evidenceIds: nextEvidenceIds } = yield* transact((tx) =>
      Effect.gen(function* updateClaimTx() {
        let nextIds: string[];
        if (input.evidenceIds === undefined) {
          const byClaim = yield* tryDb(() =>
            evidenceLinksRepo.listForClaims(tx, [existing.id])
          );
          nextIds = byClaim.get(existing.id) ?? [];
        } else {
          nextIds = yield* parseGraphEvidenceIdsEffect(input.evidenceIds);
          yield* assertEvidenceIdsInCaseEffect(scopedCaseId, nextIds, tx);
          const replaced = yield* tryDb(() =>
            evidenceLinksRepo.replaceClaim(tx, existing.id, nextIds)
          );
          if (replaced === null) {
            return yield* new InvalidError({
              reason: "Invalid evidence id",
            });
          }
          nextIds = replaced;
        }

        const nextConfidence = input.confidence ?? existing.confidence;
        if (nextConfidence === "confirmed" && nextIds.length === 0) {
          return yield* new InvalidError({
            reason: "confirmed requires at least one Evidence attachment",
          });
        }

        const updated = yield* tryDb(() =>
          claimsRepo.updateInCase(tx, scopedCaseId, claimId, {
            ...(nextText === undefined ? {} : { text: nextText }),
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

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row, nextEvidenceIds);
  });
}
