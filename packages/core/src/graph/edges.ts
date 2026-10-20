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
  type Page,
} from "@watchdog/schemas/shared";

import { parseGraphEvidenceIdsEffect } from "../evidence/evidence";
import type { Db } from "../infra/db-service";
import { pageWindow, toPage } from "../infra/page";
import type { PageRequest } from "../infra/page";
import { requireWritten, tryDb, tryDbWith } from "../infra/postgres-effect";
import { InvalidError, type DomainTag } from "../infra/tagged-errors";
import {
  assertEdgeKindsAllowedEffect,
  edgeUpdatePatchEffect,
  validateEdgeUpdateEffect,
} from "./edge-update";
import { dossierChannel, type GraphActor } from "./graph-activity";
import {
  runGraphMutation,
  type GraphWriter,
} from "./mutation/run-graph-mutation";
import { edgesTable, type EdgeWritten } from "./mutation/tables";
import {
  assertCaseInOrgEffect,
  assertConfidenceEvidenceEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "./patch/guards";

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

/** One page of an Entity's Connections, by predicate then id. */
export function listEdgesForEntityEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  entityId: string,
  page: PageRequest = {}
): Effect.Effect<Page<EdgeRecord>, DomainTag, Db> {
  return Effect.gen(function* listEdgesForEntityGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedEntityId = yield* requireTrimmedGraphId(entityId, "Entity");
    yield* assertEntityInCaseEffect(scopedCaseId, normalizedEntityId);
    const window = yield* pageWindow(page, {
      list: "entity-edges",
      keys: ["text"],
    });
    const found = yield* tryDbWith((exec) =>
      edgesRepo.listForEntity(exec, scopedCaseId, normalizedEntityId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    const byEdge = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForEdges(
        exec,
        found.slice(0, window.limit).map((r) => r.id)
      )
    );
    return toPage(
      found,
      window,
      (row) => toRecord(row, normalizedEntityId, byEdge.get(row.id) ?? []),
      (row) => ({ id: row.id, values: [row.predicate] })
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

/** One page of the Case's Connections, by predicate then id. */
export function listEdgesForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  page: PageRequest = {}
): Effect.Effect<Page<CaseEdgeRecord>, DomainTag, Db> {
  return Effect.gen(function* listEdgesForCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const window = yield* pageWindow(page, {
      list: "case-edges",
      keys: ["text"],
    });
    const found = yield* tryDbWith((exec) =>
      edgesRepo.listForCase(exec, scopedCaseId, {
        limit: window.limit + 1,
        ...(window.after === undefined ? {} : { after: window.after }),
      })
    );
    const byEdge = yield* tryDbWith((exec) =>
      evidenceLinksRepo.listForEdges(
        exec,
        found.slice(0, window.limit).map((r) => r.id)
      )
    );
    return toPage(
      found,
      window,
      (row) => toCaseEdgeRecord(row, byEdge.get(row.id) ?? []),
      (row) => ({ id: row.id, values: [row.predicate] })
    );
  });
}

/** The written Edge as the API returns it: the listed row (peer Entity) read in the transaction. */
function viewedEdge(
  w: GraphWriter,
  written: EdgeWritten,
  viewEntityId: string
): Effect.Effect<EdgeRecord, DomainTag> {
  return tryDb(() =>
    edgesRepo.getListedInCase(w.tx, w.caseId, written.id)
  ).pipe(
    requireWritten("read Edge back"),
    Effect.map((listed) => toRecord(listed, viewEntityId, written.evidenceIds))
  );
}

export function createEdgeEffect(
  input: CreateEdgeInput
): Effect.Effect<EdgeRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* createEdgeGen() {
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
          return yield* new InvalidError({
            reason: "related_to requires notes",
          });
        }

        const evidenceIds = yield* parseGraphEvidenceIdsEffect(
          input.evidenceIds ?? []
        );
        yield* assertConfidenceEvidenceEffect(input.confidence, evidenceIds);

        yield* assertEntityInCaseEffect(w.caseId, fromId, w.tx);
        yield* assertEntityInCaseEffect(w.caseId, toId, w.tx);
        yield* assertEdgeKindsAllowedEffect(
          w.caseId,
          fromId,
          toId,
          input.predicate,
          w.tx
        );
        const created = yield* w.insert(
          edgesTable,
          {
            fromId,
            toId,
            predicate: input.predicate,
            confidence: input.confidence,
            notes,
          },
          { evidence: evidenceIds }
        );
        return yield* viewedEdge(w, created, viewEntityId);
      })
  );
}

export function updateEdgeEffect(
  input: UpdateEdgeInput
): Effect.Effect<EdgeRecord, DomainTag, Db> {
  return runGraphMutation(
    {
      caseId: input.caseId,
      organizationId: input.organizationId,
      actor: input,
      channel: dossierChannel(input),
    },
    (w) =>
      Effect.gen(function* updateEdgeGen() {
        const existing = yield* w.get(edgesTable, input.edgeId);
        // The Evidence the update validates against: the new set, or what the Edge has now.
        const evidenceIds =
          input.evidenceIds === undefined
            ? ((yield* tryDb(() =>
                evidenceLinksRepo.listForEdges(w.tx, [existing.id])
              )).get(existing.id) ?? [])
            : yield* parseGraphEvidenceIdsEffect(input.evidenceIds);
        const validated = yield* validateEdgeUpdateEffect(
          input,
          existing,
          evidenceIds
        );
        const patch = yield* edgeUpdatePatchEffect(w.tx, w.caseId, validated);
        const updated = yield* w.update(edgesTable, existing.id, patch, {
          expectedVersion: input.expectedVersion,
          ...(input.evidenceIds === undefined
            ? {}
            : { evidence: input.evidenceIds }),
        });
        return yield* viewedEdge(
          w,
          updated,
          parseOptionalTrimmedUuid(input.viewEntityId) ?? existing.fromId
        );
      })
  );
}

export function deleteEdgeEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  edgeId: string,
  actor?: GraphActor
): Effect.Effect<void, DomainTag, Db> {
  return runGraphMutation(
    { caseId, organizationId, actor, channel: dossierChannel(actor) },
    (w) => w.remove(edgesTable, edgeId).pipe(Effect.asVoid)
  );
}
