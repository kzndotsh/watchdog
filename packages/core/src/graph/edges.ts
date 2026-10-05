import { Effect } from "effect";

import { edgesRepo, evidenceLinksRepo, type EdgeListRow } from "@watchdog/db";
import {
  normalizeUuidList,
  parseOptionalTrimmedUuid,
  trimmedOrNull,
  type CaseId,
  type ConfidenceTier,
  type EdgePredicate,
  type EntityKind,
  type OrganizationId,
} from "@watchdog/schemas/shared";

import {
  assertEvidenceIdsInCaseEffect,
  parseGraphEvidenceIdsEffect,
} from "../evidence/evidence";
import type { Db } from "../infra/db-service";
import { notifyEntityChangedEffect } from "../infra/events";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  InternalError,
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
  assertEvidenceLinkedEffect,
  requireTrimmedGraphId,
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
  caseId: CaseId;
  organizationId: OrganizationId;
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
  caseId: CaseId;
  organizationId: OrganizationId;
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
  notes?: string | null;
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
    evidenceIds: normalizeUuidList(evidenceIds),
    peerId: outbound ? row.toId : row.fromId,
    peerName: outbound ? row.toName : row.fromName,
    peerSlug: outbound ? row.toSlug : row.fromSlug,
    peerKind: outbound ? row.toKind : row.fromKind,
    direction: outbound ? "out" : "in",
  };
}

export function listEdgesForEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string
): Effect.Effect<EdgeRecord[], DomainTag, Db> {
  return Effect.gen(function* listEdgesForEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const rows = yield* tryDbWith((exec) =>
      edgesRepo.listForEntity(exec, scopedCaseId, normalizedEntityId)
    );
    const byEdge = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForEdges(
        exec,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) =>
      toRecord(row, normalizedEntityId, byEdge.get(row.id) ?? [])
    );
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
    evidenceIds: normalizeUuidList(evidenceIds),
  };
}

export function listEdgesForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId
): Effect.Effect<CaseEdgeRecord[], DomainTag, Db> {
  return Effect.gen(function* listEdgesForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDbWith((exec) =>
      edgesRepo.listForCase(exec, scopedCaseId)
    );
    const byEdge = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForEdges(
        exec,
        rows.map((r) => r.id)
      )
    );
    return rows.map((row) => toCaseEdgeRecord(row, byEdge.get(row.id) ?? []));
  });
}

export function createEdgeEffect(
  input: CreateEdgeInput
): Effect.Effect<EdgeRecord, DomainTag, Db> {
  return Effect.gen(function* createEdgeGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const fromId = parseOptionalTrimmedUuid(input.fromId);
    const toId = parseOptionalTrimmedUuid(input.toId);
    if (fromId === undefined || toId === undefined) {
      return yield* new InvalidError({
        reason: "fromId and toId must be valid UUIDs",
      });
    }
    if (fromId === toId) {
      return yield* new InvalidError({
        reason: "Edge cannot link an Entity to itself",
      });
    }

    const rawViewEntityId = input.viewEntityId;
    const viewEntityId =
      rawViewEntityId === undefined
        ? fromId
        : parseOptionalTrimmedUuid(rawViewEntityId);
    if (rawViewEntityId !== undefined && viewEntityId === undefined) {
      return yield* new InvalidError({
        reason: "viewEntityId must be a valid UUID",
      });
    }
    if (viewEntityId !== fromId && viewEntityId !== toId) {
      return yield* new InvalidError({
        reason: "viewEntityId must be an endpoint of the Edge",
      });
    }

    const notes = trimmedOrNull(input.notes);
    if (input.predicate === "related_to" && notes === null) {
      return yield* new InvalidError({ reason: "related_to requires notes" });
    }

    const evidenceIds = yield* parseGraphEvidenceIdsEffect(
      input.evidenceIds ?? []
    );
    yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

    const created = yield* transact(
      (tx) =>
        Effect.gen(function* createEdgeTx() {
          yield* assertEntityInCaseEffect(scopedCaseId, fromId, tx);
          yield* assertEntityInCaseEffect(scopedCaseId, toId, tx);
          yield* assertEdgeKindsAllowedEffect(
            scopedCaseId,
            fromId,
            toId,
            input.predicate,
            tx
          );
          yield* assertEvidenceIdsInCaseEffect(scopedCaseId, evidenceIds, tx);

          const row = yield* tryDb(() =>
            edgesRepo.create(tx, {
              fromId,
              toId,
              predicate: input.predicate,
              confidence: input.confidence,
              notes,
            })
          );
          if (!row) {
            return yield* new InternalError({
              reason: "Failed to create Edge",
            });
          }
          const linked = yield* tryDb(() =>
            evidenceLinksRepo.linkEdge(tx, row.id, evidenceIds)
          );
          yield* assertEvidenceLinkedEffect(linked);
          return row;
        }),
      {
        uniqueIndex: NATURAL_KEY_INDEX,
        conflictReason: "That Edge already exists",
      }
    );

    const listed = yield* tryDbWith((exec) =>
      edgesRepo.getListedInCase(exec, scopedCaseId, created.id)
    );
    if (!listed) {
      return yield* new InvalidError({ reason: "Edge created but not found" });
    }

    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(listed, viewEntityId, evidenceIds);
  });
}

export function updateEdgeEffect(
  input: UpdateEdgeInput
): Effect.Effect<EdgeRecord, DomainTag, Db> {
  return Effect.gen(function* updateEdgeGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const edgeId = yield* requireTrimmedGraphId(input.edgeId, "Edge");
    const existing = yield* tryDbWith((exec) =>
      edgesRepo.getInCase(exec, scopedCaseId, edgeId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Edge", id: edgeId });
    }

    const byEdge = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForEdges(exec, [existing.id])
    );
    const evidenceIds = byEdge.get(existing.id) ?? [];
    const scopedInput = { ...input, caseId: scopedCaseId, edgeId };

    const { listed, evidenceIds: nextEvidenceIds } = yield* transact(
      (tx) =>
        Effect.gen(function* updateEdgeTx() {
          let nextIds = evidenceIds;
          if (scopedInput.evidenceIds !== undefined) {
            nextIds = yield* parseGraphEvidenceIdsEffect(
              scopedInput.evidenceIds
            );
            yield* assertEvidenceIdsInCaseEffect(
              scopedInput.caseId,
              nextIds,
              tx
            );
            const replaced = yield* tryDb(() =>
              evidenceLinksRepo.replaceEdge(tx, existing.id, nextIds)
            );
            if (replaced === null) {
              return yield* new InvalidError({
                reason: "Invalid evidence id",
              });
            }
            nextIds = replaced;
          }

          const validated = yield* validateEdgeUpdateEffect(
            scopedInput,
            existing,
            nextIds
          );
          const listedRow = yield* applyValidatedEdgeUpdateEffect(
            tx,
            scopedInput,
            validated
          );
          return { listed: listedRow, evidenceIds: nextIds };
        }),
      {
        uniqueIndex: NATURAL_KEY_INDEX,
        conflictReason: "That Edge already exists",
      }
    );

    const viewEntityId =
      parseOptionalTrimmedUuid(input.viewEntityId) ?? existing.fromId;
    yield* notifyEntityChangedEffect(scopedCaseId);
    return toRecord(listed, viewEntityId, nextEvidenceIds);
  });
}

export function deleteEdgeEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  edgeId: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteEdgeGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEdgeId = yield* requireTrimmedGraphId(edgeId, "Edge");
    const existing = yield* tryDbWith((exec) =>
      edgesRepo.getInCase(exec, scopedCaseId, normalizedEdgeId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Edge", id: normalizedEdgeId });
    }

    const deleted = yield* tryDbWith((exec) =>
      edgesRepo.deleteInCase(exec, scopedCaseId, normalizedEdgeId)
    );
    if (!deleted) {
      return yield* new NotFoundError({ entity: "Edge", id: normalizedEdgeId });
    }

    yield* notifyEntityChangedEffect(scopedCaseId);
  });
}
