import { Effect } from "effect";

import {
  db,
  edgesRepo,
  evidenceLinksRepo,
  type EdgeListRow,
} from "@watchdog/db";
import {
  normalizeIdList,
  type ConfidenceTier,
  type EdgePredicate,
  type EntityKind,
} from "@watchdog/schemas";

import { assertEvidenceIdsInCaseEffect } from "../evidence/evidence";
import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import {
  applyValidatedEdgeUpdateEffect,
  assertEdgeKindsAllowedEffect,
  validateEdgeUpdateEffect,
} from "./edge-update";
import {
  assertCaseInOrgEffect,
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
} from "./patch/guards";

const NATURAL_KEY_INDEX = "edges_natural_uidx";

export interface EdgeRecord {
  id: string;
  fromId: string;
  toId: string;
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
  notes: string | null;
  evidenceIds: string[];
  /** Peer Entity for dossier display (the other end from this Entity). */
  peerId: string;
  peerName: string;
  peerSlug: string;
  peerKind: EntityKind;
  direction: "out" | "in";
}

export interface CreateEdgeInput {
  caseId: string;
  organizationId: string;
  fromId: string;
  toId: string;
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
  notes?: string;
  evidenceIds?: string[];
  /**
   * Entity whose dossier orientation to use on the returned record.
   * Defaults to `fromId`.
   */
  viewEntityId?: string;
}

export interface UpdateEdgeInput {
  caseId: string;
  organizationId: string;
  edgeId: string;
  /**
   * Entity whose dossier orientation to use on the returned record.
   * Defaults to the edge's `fromId`.
   */
  viewEntityId?: string;
  /** Absolute endpoints (send both to change orientation or peer). */
  fromId?: string;
  toId?: string;
  predicate?: EdgePredicate;
  confidence?: ConfidenceTier;
  notes?: string;
  evidenceIds?: string[];
}

function toRecord(
  row: EdgeListRow,
  viewEntityId: string,
  evidenceIds: string[]
): EdgeRecord {
  const outbound = row.fromId === viewEntityId;
  return {
    id: row.id,
    fromId: row.fromId,
    toId: row.toId,
    predicate: row.predicate,
    confidence: row.confidence,
    notes: row.notes ?? null,
    evidenceIds,
    peerId: outbound ? row.toId : row.fromId,
    peerName: outbound ? row.toName : row.fromName,
    peerSlug: outbound ? row.toSlug : row.fromSlug,
    peerKind: outbound ? row.toKind : row.fromKind,
    direction: outbound ? "out" : "in",
  };
}

export function listEdgesForEntityEffect(
  caseId: string,
  organizationId: string,
  entityId: string
): Effect.Effect<EdgeRecord[], DomainTag> {
  return Effect.gen(function* listEdgesForEntityGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    yield* assertEntityInCaseEffect(caseId, entityId, db);
    const rows = yield* tryDb(() =>
      edgesRepo.listForEntity(db, caseId, entityId)
    );
    const byEdge = yield* tryDb(() =>
      evidenceLinksRepo.listForEdges(
        db,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) => toRecord(row, entityId, byEdge.get(row.id) ?? []));
  });
}

/** Case-wide edge — absolute endpoints (no peer/direction). */
export interface CaseEdgeRecord {
  id: string;
  fromId: string;
  fromName: string;
  fromSlug: string;
  fromKind: EntityKind;
  toId: string;
  toName: string;
  toSlug: string;
  toKind: EntityKind;
  predicate: EdgePredicate;
  confidence: ConfidenceTier;
  notes: string | null;
  evidenceIds: string[];
}

export function toCaseEdgeRecord(
  row: EdgeListRow,
  evidenceIds: string[]
): CaseEdgeRecord {
  return {
    id: row.id,
    fromId: row.fromId,
    fromName: row.fromName,
    fromSlug: row.fromSlug,
    fromKind: row.fromKind,
    toId: row.toId,
    toName: row.toName,
    toSlug: row.toSlug,
    toKind: row.toKind,
    predicate: row.predicate,
    confidence: row.confidence,
    notes: row.notes ?? null,
    evidenceIds,
  };
}

export function listEdgesForCaseEffect(
  caseId: string,
  organizationId: string
): Effect.Effect<CaseEdgeRecord[], DomainTag> {
  return Effect.gen(function* listEdgesForCaseGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() => edgesRepo.listForCase(db, caseId));
    const byEdge = yield* tryDb(() =>
      evidenceLinksRepo.listForEdges(
        db,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) => toCaseEdgeRecord(row, byEdge.get(row.id) ?? []));
  });
}

export function createEdgeEffect(
  input: CreateEdgeInput
): Effect.Effect<EdgeRecord, DomainTag> {
  return Effect.gen(function* createEdgeGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    if (input.fromId === input.toId) {
      return yield* new InvalidError({
        reason: "Edge cannot link an Entity to itself",
      });
    }

    const viewEntityId = input.viewEntityId ?? input.fromId;
    if (viewEntityId !== input.fromId && viewEntityId !== input.toId) {
      return yield* new InvalidError({
        reason: "viewEntityId must be an endpoint of the Edge",
      });
    }

    const trimmedNotes = input.notes?.trim();
    if (
      input.predicate === "related_to" &&
      (trimmedNotes === undefined || trimmedNotes === "")
    ) {
      return yield* new InvalidError({ reason: "related_to requires notes" });
    }

    const evidenceIds = normalizeIdList(input.evidenceIds ?? []);
    yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

    const created = yield* transact(
      (tx) =>
        Effect.gen(function* createEdgeTx() {
          yield* assertEntityInCaseEffect(input.caseId, input.fromId, tx);
          yield* assertEntityInCaseEffect(input.caseId, input.toId, tx);
          yield* assertEdgeKindsAllowedEffect(
            input.caseId,
            input.fromId,
            input.toId,
            input.predicate,
            tx
          );
          yield* assertEvidenceIdsInCaseEffect(input.caseId, evidenceIds, tx);

          const row = yield* tryDb(() =>
            edgesRepo.create(tx, {
              fromId: input.fromId,
              toId: input.toId,
              predicate: input.predicate,
              confidence: input.confidence,
              notes: input.notes ?? null,
            })
          );
          if (!row) {
            return yield* new InvalidError({
              reason: "Failed to create Edge",
            });
          }
          yield* tryDb(() =>
            evidenceLinksRepo.linkEdge(tx, row.id, evidenceIds)
          );
          return row;
        }),
      {
        uniqueIndex: NATURAL_KEY_INDEX,
        conflictReason: "That Edge already exists",
      }
    );

    const listed = yield* tryDb(() =>
      edgesRepo.getListedInCase(db, input.caseId, created.id)
    );
    if (!listed) {
      return yield* new InvalidError({ reason: "Edge created but not found" });
    }

    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(listed, viewEntityId, evidenceIds);
  });
}

export function updateEdgeEffect(
  input: UpdateEdgeInput
): Effect.Effect<EdgeRecord, DomainTag> {
  return Effect.gen(function* updateEdgeGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      edgesRepo.getInCase(db, input.caseId, input.edgeId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Edge not found in this Case",
      });
    }

    const byEdge = yield* tryDb(() =>
      evidenceLinksRepo.listForEdges(db, [existing.id])
    );
    const evidenceIds = byEdge.get(existing.id) ?? [];

    const { listed, evidenceIds: nextEvidenceIds } = yield* transact(
      (tx) =>
        Effect.gen(function* updateEdgeTx() {
          let nextIds = evidenceIds;
          if (input.evidenceIds !== undefined) {
            nextIds = normalizeIdList(input.evidenceIds);
            yield* assertEvidenceIdsInCaseEffect(input.caseId, nextIds, tx);
            nextIds = yield* tryDb(() =>
              evidenceLinksRepo.replaceEdge(tx, existing.id, nextIds)
            );
          }

          const validated = yield* validateEdgeUpdateEffect(
            input,
            existing,
            nextIds
          );
          const listedRow = yield* applyValidatedEdgeUpdateEffect(
            tx,
            input,
            validated
          );
          return { listed: listedRow, evidenceIds: nextIds };
        }),
      {
        uniqueIndex: NATURAL_KEY_INDEX,
        conflictReason: "That Edge already exists",
      }
    );

    const viewEntityId = input.viewEntityId ?? existing.fromId;
    yield* notifyEntityChangedEffect(input.caseId);
    return toRecord(listed, viewEntityId, nextEvidenceIds);
  });
}

export function deleteEdgeEffect(
  caseId: string,
  organizationId: string,
  edgeId: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteEdgeGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const existing = yield* tryDb(() =>
      edgesRepo.getInCase(db, caseId, edgeId)
    );
    if (!existing) {
      return yield* new NotFoundError({
        resource: "Edge not found in this Case",
      });
    }

    const deleted = yield* tryDb(() => edgesRepo.delete(db, edgeId));
    if (!deleted) {
      return yield* new InvalidError({ reason: "Failed to delete Edge" });
    }

    yield* notifyEntityChangedEffect(caseId);
  });
}
