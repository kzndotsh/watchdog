import {
  claimsRepo,
  eventsRepo,
  evidenceLinksRepo,
  type ClaimPatch,
  type ClaimRow,
  type EventPatch,
  type EventRow,
  type NewClaim,
  type NewEvent,
  type RetractClaimValues,
} from "@watchdog/db";
import type {
  ClaimClass,
  ConfidenceTier,
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
