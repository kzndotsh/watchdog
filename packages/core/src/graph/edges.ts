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
import { tryDb, tryDbWith, requireWritten } from "../infra/postgres-effect";
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
  appendGraphActivityEffect,
  dossierHistory,
  setHistoryContextEffect,
  graphActorFields,
  type GraphActor,
} from "./graph-activity";
import {
  assertCaseInOrgEffect,
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
  missedVersionedUpdateEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

const NATURAL_KEY_INDEX = "edges_natural_uidx";

export type EdgeRecord = {
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
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export type CreateEdgeInput = {
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
} & GraphActor;

export type UpdateEdgeInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  edgeId: string;
  /** The `version` the caller last read; an update of a row that moved on is `StaleVersionError`. */
  expectedVersion: number;
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
} & GraphActor;

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
    version: row.version,
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
export type CaseEdgeRecord = {
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
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

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
    version: row.version,
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
          yield* setHistoryContextEffect(tx, dossierHistory(input));
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
              caseId: scopedCaseId,
              fromId,
              toId,
              predicate: input.predicate,
              confidence: input.confidence,
              notes,
            })
          ).pipe(requireWritten("create Edge"));
          yield* tryDb(() =>
            evidenceLinksRepo.linkEdge(tx, scopedCaseId, row.id, evidenceIds)
          ).pipe(requireWritten("link evidence"));
          yield* appendGraphActivityEffect(tx, {
            ...graphActorFields(input),
            caseId: scopedCaseId,
            kind: "edge",
            action: "created",
            subjectId: row.id,
            label: row.predicate,
          });
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
      return yield* new InternalError({
        reason: "Edge created but not readable",
      });
    }

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
          yield* setHistoryContextEffect(tx, dossierHistory(input));
          const missedVersion = () =>
            Effect.gen(function* missedEdgeVersionGen() {
              const current = yield* tryDb(() =>
                edgesRepo.getInCase(tx, scopedCaseId, edgeId)
              );
              return yield* missedVersionedUpdateEffect(current, {
                entity: "Edge",
                id: edgeId,
              });
            });
          let nextIds = evidenceIds;
          if (scopedInput.evidenceIds !== undefined) {
            // Replacing the Evidence touches the row (a version bump), so the version is checked
            // first, by taking the row's lock only if it is still at `expectedVersion`.
            const locked = yield* tryDb(() =>
              edgesRepo.lockAtVersionInCase(
                tx,
                scopedCaseId,
                edgeId,
                input.expectedVersion
              )
            );
            if (!locked) return yield* missedVersion();
            nextIds = yield* parseGraphEvidenceIdsEffect(
              scopedInput.evidenceIds
            );
            yield* assertEvidenceIdsInCaseEffect(
              scopedInput.caseId,
              nextIds,
              tx
            );
            const replaced = yield* tryDb(() =>
              evidenceLinksRepo.replaceEdge(
                tx,
                scopedInput.caseId,
                existing.id,
                nextIds
              )
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
          yield* applyValidatedEdgeUpdateEffect(
            tx,
            scopedInput,
            validated,
            scopedInput.evidenceIds === undefined
              ? input.expectedVersion
              : undefined
          );
          // Read the row as it now stands (a changed Evidence set bumped the version).
          const listedRow = yield* tryDb(() =>
            edgesRepo.getListedInCase(tx, scopedCaseId, edgeId)
          ).pipe(requireWritten("read Edge back"));
          yield* appendGraphActivityEffect(tx, {
            ...graphActorFields(input),
            caseId: scopedCaseId,
            kind: "edge",
            action: "updated",
            subjectId: edgeId,
            label: listedRow.predicate,
          });
          return { listed: listedRow, evidenceIds: nextIds };
        }),
      {
        uniqueIndex: NATURAL_KEY_INDEX,
        conflictReason: "That Edge already exists",
      }
    );

    const viewEntityId =
      parseOptionalTrimmedUuid(input.viewEntityId) ?? existing.fromId;
    return toRecord(listed, viewEntityId, nextEvidenceIds);
  });
}

export function deleteEdgeEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  edgeId: string,
  actor?: GraphActor
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

    yield* transact((tx) =>
      Effect.gen(function* deleteEdgeTx() {
        yield* setHistoryContextEffect(tx, dossierHistory(actor));
        const deleted = yield* tryDb(() =>
          edgesRepo.deleteInCase(tx, scopedCaseId, normalizedEdgeId)
        );
        if (!deleted) {
          return yield* new NotFoundError({
            entity: "Edge",
            id: normalizedEdgeId,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          ...graphActorFields(actor),
          caseId: scopedCaseId,
          kind: "edge",
          action: "deleted",
          subjectId: normalizedEdgeId,
          label: deleted.predicate,
        });
      })
    );
  });
}
