import { Effect } from "effect";

import {
  db,
  evidenceLinksRepo,
  identifiersRepo,
  type IdentifierListRow,
  type IdentifierRow,
} from "@watchdog/db";
import type {
  ConfidenceTier,
  EntityKind,
  IdentifierStatus,
  IdentifierType,
} from "@watchdog/schemas";
import { normalizeUuidList, trimmedOrNull, validateIdentifierWrite } from "@watchdog/schemas";

import { assertEvidenceIdsInCaseEffect, parseGraphEvidenceIdsEffect } from "../evidence/evidence";
import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
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

const NATURAL_KEY_INDEX = "identifiers_natural_uidx";
const DUPLICATE_MESSAGE = "That Identifier already exists on this Entity";

export interface IdentifierRecord {
  id: string;
  entityId: string;
  type: IdentifierType;
  platform: string;
  value: string;
  confidence: ConfidenceTier;
  status: IdentifierStatus;
  notes: string | null;
  evidenceIds: string[];
}

export interface CreateIdentifierInput {
  caseId: string;
  organizationId: string;
  entityId: string;
  type: IdentifierType;
  value: string;
  confidence: ConfidenceTier;
  platform?: string;
  status: IdentifierStatus;
  notes?: string;
  evidenceIds?: string[];
}

export interface UpdateIdentifierInput {
  caseId: string;
  organizationId: string;
  identifierId: string;
  value?: string;
  platform?: string | null;
  type?: IdentifierType;
  status?: IdentifierStatus;
  confidence?: ConfidenceTier;
  notes?: string | null;
  evidenceIds?: string[];
}

function toRecord(row: IdentifierRow, evidenceIds: string[]): IdentifierRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    type: row.type,
    platform: row.platform,
    value: row.value,
    confidence: row.confidence,
    status: row.status,
    notes: row.notes ?? null,
    evidenceIds: normalizeUuidList(evidenceIds),
  };
}

export function listIdentifiersForEntityEffect(
  caseId: string,
  organizationId: string,
  entityId: string
): Effect.Effect<IdentifierRecord[], DomainTag> {
  return Effect.gen(function* listIdentifiersForEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(
      entityId,
      "Entity not found in this Case"
    );
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId, db);
    const rows = yield* tryDb(() =>
      identifiersRepo.listForEntity(db, normalizedEntityId)
    );
    const byId = yield* tryDb(() =>
      evidenceLinksRepo.listForIdentifiers(
        db,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) => toRecord(row, byId.get(row.id) ?? []));
  });
}

/** Identifier plus owning entity labels for case-wide lists. */
export interface CaseIdentifierRecord extends IdentifierRecord {
  entityName: string;
  entitySlug: string;
  entityKind: EntityKind;
  entitySummary: string | null;
  entityNotes: string | null;
}

export function toCaseIdentifierRecord(
  row: IdentifierListRow,
  evidenceIds: string[]
): CaseIdentifierRecord {
  return {
    ...toRecord(row, evidenceIds),
    entityName: row.entityName,
    entitySlug: row.entitySlug,
    entityKind: row.entityKind,
    entitySummary: row.entitySummary,
    entityNotes: row.entityNotes,
  };
}

export function listIdentifiersForCaseEffect(
  caseId: string,
  organizationId: string
): Effect.Effect<CaseIdentifierRecord[], DomainTag> {
  return Effect.gen(function* listIdentifiersForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() => identifiersRepo.listForCase(db, scopedCaseId));
    const byId = yield* tryDb(() =>
      evidenceLinksRepo.listForIdentifiers(
        db,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) =>
      toCaseIdentifierRecord(row, byId.get(row.id) ?? [])
    );
  });
}

export function createIdentifierEffect(
  input: CreateIdentifierInput
): Effect.Effect<IdentifierRecord, DomainTag> {
  return Effect.gen(function* createIdentifierGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const written = validateIdentifierWrite({
      type: input.type,
      value: input.value,
      platform: input.platform,
    });
    if (!written.ok) {
      return yield* new InvalidError({ reason: written.message });
    }
    const { type, value, platform } = written;

    const evidenceIds = yield* parseGraphEvidenceIdsEffect(input.evidenceIds ?? []);
    yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

    const entityId = yield* requireTrimmedGraphId(
      input.entityId,
      "Entity not found in this Case"
    );

    const row = yield* transact(
      (tx) =>
        Effect.gen(function* createIdentifierTx() {
          yield* assertEntityInCaseEffect(scopedCaseId, entityId, tx);
          yield* assertEvidenceIdsInCaseEffect(scopedCaseId, evidenceIds, tx);

          const created = yield* tryDb(() =>
            identifiersRepo.create(tx, {
              entityId,
              type,
              platform,
              value,
              confidence: input.confidence,
              status: input.status,
              notes: trimmedOrNull(input.notes),
            })
          );
          if (!created) {
            return yield* new InvalidError({
              reason: "Failed to create Identifier",
            });
          }
          const linked = yield* tryDb(() =>
            evidenceLinksRepo.linkIdentifier(tx, created.id, evidenceIds)
          );
          yield* assertEvidenceLinkedEffect(linked);
          return created;
        }),
      { uniqueIndex: NATURAL_KEY_INDEX, conflictReason: DUPLICATE_MESSAGE }
    );

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row, evidenceIds);
  });
}

export function updateIdentifierEffect(
  input: UpdateIdentifierInput
): Effect.Effect<IdentifierRecord, DomainTag> {
  return Effect.gen(function* updateIdentifierGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const identifierId = yield* requireTrimmedGraphId(
      input.identifierId,
      "Identifier not found"
    );
    const existing = yield* tryDb(() =>
      identifiersRepo.getInCase(db, scopedCaseId, identifierId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Identifier not found" });
    }

    if (
      input.value === undefined &&
      input.platform === undefined &&
      input.type === undefined &&
      input.status === undefined &&
      input.confidence === undefined &&
      input.notes === undefined &&
      input.evidenceIds === undefined
    ) {
      return yield* new InvalidError({ reason: "Nothing to update" });
    }

    const { row, evidenceIds: nextEvidenceIds } = yield* transact(
      (tx) =>
        Effect.gen(function* updateIdentifierTx() {
          let nextIds: string[];
          if (input.evidenceIds === undefined) {
            const byId = yield* tryDb(() =>
              evidenceLinksRepo.listForIdentifiers(tx, [existing.id])
            );
            nextIds = byId.get(existing.id) ?? [];
          } else {
            nextIds = yield* parseGraphEvidenceIdsEffect(input.evidenceIds);
            yield* assertEvidenceIdsInCaseEffect(scopedCaseId, nextIds, tx);
            const replaced = yield* tryDb(() =>
              evidenceLinksRepo.replaceIdentifier(tx, existing.id, nextIds)
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

          const patch: Parameters<typeof identifiersRepo.updateInCase>[3] = {};
          if (
            input.value !== undefined ||
            input.type !== undefined ||
            input.platform !== undefined
          ) {
            const nextPlatform =
              input.platform === undefined
                ? existing.platform
                : trimmedOrNull(input.platform) ?? "";
            const written = validateIdentifierWrite({
              type: input.type ?? existing.type,
              value: input.value ?? existing.value,
              platform: nextPlatform,
            });
            if (!written.ok) {
              return yield* new InvalidError({ reason: written.message });
            }
            if (input.type !== undefined) patch.type = written.type;
            if (input.platform !== undefined) {
              patch.platform = written.platform;
            }
            if (
              input.value !== undefined ||
              input.type !== undefined ||
              written.value !== existing.value
            ) {
              patch.value = written.value;
            }
          }
          if (input.status !== undefined) patch.status = input.status;
          if (input.confidence !== undefined) {
            patch.confidence = input.confidence;
          }
          if (input.notes !== undefined) {
            patch.notes = trimmedOrNull(input.notes);
          }

          if (Object.keys(patch).length === 0) {
            return { row: existing, evidenceIds: nextIds };
          }

          const updated = yield* tryDb(() =>
            identifiersRepo.updateInCase(
              tx,
              scopedCaseId,
              identifierId,
              patch
            )
          );
          if (!updated) {
            return yield* new InvalidError({
              reason: "Failed to update Identifier",
            });
          }
          return { row: updated, evidenceIds: nextIds };
        }),
      { uniqueIndex: NATURAL_KEY_INDEX, conflictReason: DUPLICATE_MESSAGE }
    );

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(row, nextEvidenceIds);
  });
}

export function deleteIdentifierEffect(
  caseId: string,
  organizationId: string,
  identifierId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteIdentifierGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedIdentifierId = yield* requireTrimmedGraphId(
      identifierId,
      "Identifier not found"
    );
    const existing = yield* tryDb(() =>
      identifiersRepo.getInCase(db, scopedCaseId, normalizedIdentifierId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Identifier not found in this Case",
      });
    }

    const deleted = yield* tryDb(() =>
      identifiersRepo.deleteInCase(db, scopedCaseId, normalizedIdentifierId)
    );
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Identifier" });
    }

    yield* notifyEntityChangedEffect(scopedCaseId);
  });
}
