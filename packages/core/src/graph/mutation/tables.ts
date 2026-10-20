import {
  claimsRepo,
  edgesRepo,
  eventsRepo,
  evidenceLinksRepo,
  identifiersRepo,
  type ClaimPatch,
  type ClaimRow,
  type EdgePatch,
  type EdgeRow,
  type EventPatch,
  type EventRow,
  type IdentifierPatch,
  type IdentifierRow,
  type NewClaim,
  type NewEdge,
  type NewEvent,
  type NewIdentifier,
  type RetractClaimValues,
} from "@watchdog/db";
import type {
  ClaimClass,
  ConfidenceTier,
  IdentifierStatus,
  IdentifierType,
  RetractKind,
} from "@watchdog/schemas/shared";
import { normalizeUuidList } from "@watchdog/schemas/shared";

import type {
  GraphTable,
  GraphTransition,
  RemovableGraphTable,
} from "./graph-table";

export type EventRecord = {
  id: string;
  entityId: string;
  when: string;
  what: string;
  where: string | null;
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export function toEventRecord(row: EventRow): EventRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    when: row.when,
    what: row.what,
    where: row.whereText,
    version: row.version,
  };
}

export type ClaimRecord = {
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
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export function toClaimRecord(
  row: ClaimRow,
  evidenceIds: readonly string[]
): ClaimRecord {
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
    evidenceIds: normalizeUuidList([...evidenceIds]),
    version: row.version,
  };
}

/** The Graph table descriptors. Only this file calls a Graph repo write (the module's single seam). */
export const eventsTable: RemovableGraphTable<
  EventRow,
  EventRecord,
  Omit<NewEvent, "caseId">,
  EventPatch
> = {
  kind: "event",
  entity: "Event",
  label: (row) => row.what,
  toRecord: toEventRecord,
  repo: {
    get: (exec, caseId, id) => eventsRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      eventsRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      eventsRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
    remove: (exec, caseId, id) => eventsRepo.deleteInCase(exec, caseId, id),
  },
};

/** Claims are retracted, never deleted: the table has no `remove`. */
export const claimsTable: GraphTable<
  ClaimRow,
  ClaimRecord,
  Omit<NewClaim, "caseId">,
  ClaimPatch
> = {
  kind: "claim",
  entity: "Claim",
  label: (row) => row.text,
  toRecord: toClaimRecord,
  evidence: {
    list: (exec, ids) => evidenceLinksRepo.listForClaims(exec, ids),
    link: (exec, caseId, id, evidenceIds) =>
      evidenceLinksRepo.linkClaim(exec, caseId, id, evidenceIds),
    replace: (exec, caseId, id, evidenceIds) =>
      evidenceLinksRepo.replaceClaim(exec, caseId, id, evidenceIds),
    lockAtVersion: (exec, caseId, id, version) =>
      claimsRepo.lockAtVersionInCase(exec, caseId, id, version),
  },
  repo: {
    get: (exec, caseId, id) => claimsRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      claimsRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      claimsRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
  },
};

/** A live Claim becomes retracted; `retracted = false` is in the UPDATE, so of two concurrent retracts one matches. */
export const retractClaim: GraphTransition<ClaimRow, RetractClaimValues> = {
  verb: "retracted",
  conflict: "Claim already retracted",
  apply: (exec, caseId, id, set) =>
    claimsRepo.retractInCase(exec, caseId, id, set),
};

export type IdentifierRecord = {
  id: string;
  entityId: string;
  type: IdentifierType;
  platform: string;
  value: string;
  confidence: ConfidenceTier;
  status: IdentifierStatus;
  notes: string | null;
  evidenceIds: string[];
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export function toIdentifierRecord(
  row: IdentifierRow,
  evidenceIds: readonly string[]
): IdentifierRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    type: row.type,
    platform: row.platform,
    value: row.value,
    confidence: row.confidence,
    status: row.status,
    notes: row.notes ?? null,
    evidenceIds: normalizeUuidList([...evidenceIds]),
    version: row.version,
  };
}

/** The natural key (Entity, type, platform, value): a duplicate is Conflict. */
export const identifiersTable: RemovableGraphTable<
  IdentifierRow,
  IdentifierRecord,
  Omit<NewIdentifier, "caseId">,
  IdentifierPatch
> = {
  kind: "identifier",
  entity: "Identifier",
  label: (row) => row.value,
  toRecord: toIdentifierRecord,
  evidence: {
    list: (exec, ids) => evidenceLinksRepo.listForIdentifiers(exec, ids),
    link: (exec, caseId, id, evidenceIds) =>
      evidenceLinksRepo.linkIdentifier(exec, caseId, id, evidenceIds),
    replace: (exec, caseId, id, evidenceIds) =>
      evidenceLinksRepo.replaceIdentifier(exec, caseId, id, evidenceIds),
    lockAtVersion: (exec, caseId, id, version) =>
      identifiersRepo.lockAtVersionInCase(exec, caseId, id, version),
  },
  naturalKey: {
    uniqueIndex: "identifiers_natural_uidx",
    conflictReason: "That Identifier already exists on this Entity",
  },
  repo: {
    get: (exec, caseId, id) => identifiersRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      identifiersRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      identifiersRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
    remove: (exec, caseId, id) =>
      identifiersRepo.deleteInCase(exec, caseId, id),
  },
};

/**
 * What an Edge write returns: the row's id, version and linked Evidence. The API record
 * also carries the peer Entity, which depends on the Entity being viewed, so the caller
 * reads the listed row in the same transaction.
 */
export type EdgeWritten = {
  id: string;
  version: number;
  evidenceIds: string[];
};

export function toEdgeWritten(
  row: EdgeRow,
  evidenceIds: readonly string[]
): EdgeWritten {
  return {
    id: row.id,
    version: row.version,
    evidenceIds: normalizeUuidList([...evidenceIds]),
  };
}

/** The natural key (from, to, predicate): a duplicate is Conflict. */
export const edgesTable: RemovableGraphTable<
  EdgeRow,
  EdgeWritten,
  Omit<NewEdge, "caseId">,
  EdgePatch
> = {
  kind: "edge",
  entity: "Edge",
  label: (row) => row.predicate,
  toRecord: toEdgeWritten,
  evidence: {
    list: (exec, ids) => evidenceLinksRepo.listForEdges(exec, ids),
    link: (exec, caseId, id, evidenceIds) =>
      evidenceLinksRepo.linkEdge(exec, caseId, id, evidenceIds),
    replace: (exec, caseId, id, evidenceIds) =>
      evidenceLinksRepo.replaceEdge(exec, caseId, id, evidenceIds),
    lockAtVersion: (exec, caseId, id, version) =>
      edgesRepo.lockAtVersionInCase(exec, caseId, id, version),
  },
  naturalKey: {
    uniqueIndex: "edges_natural_uidx",
    conflictReason: "That Edge already exists",
  },
  repo: {
    get: (exec, caseId, id) => edgesRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      edgesRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      edgesRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
    remove: (exec, caseId, id) => edgesRepo.deleteInCase(exec, caseId, id),
  },
};
