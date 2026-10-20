import {
  claimsRepo,
  entitiesRepo,
  eventsRepo,
  evidenceLinksRepo,
  questionsRepo,
  type ClaimPatch,
  type ClaimRow,
  type EntityPatch,
  type EntityRow,
  type EventPatch,
  type EventRow,
  type NewClaim,
  type NewEntity,
  type NewEvent,
  type NewQuestion,
  type QuestionPatch,
  type QuestionRow,
  type ResolveQuestionValues,
  type RetractClaimValues,
} from "@watchdog/db";
import type {
  CaseId,
  ClaimClass,
  ConfidenceTier,
  EntityKind,
  QuestionStatus,
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

export type EntityRecord = {
  id: string;
  caseId: CaseId;
  kind: EntityKind;
  name: string;
  slug: string;
  summary: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export function toEntityRecord(row: EntityRow): EntityRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    summary: row.summary ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    version: row.version,
  };
}

export type QuestionRecord = {
  id: string;
  entityId: string;
  text: string;
  status: QuestionStatus;
  resolvedNote: string | null;
  /** Optimistic-concurrency token: send it back as `expectedVersion` on an update. */
  version: number;
};

export function toQuestionRecord(row: QuestionRow): QuestionRecord {
  return {
    id: row.id,
    entityId: row.entityId,
    text: row.text,
    status: row.status,
    resolvedNote: row.resolvedNote ?? null,
    version: row.version,
  };
}

/** A Case's slugs are unique: the index backs the in-transaction duplicate check against a concurrent create. */
export const entitiesTable: RemovableGraphTable<
  EntityRow,
  EntityRecord,
  Omit<NewEntity, "caseId">,
  EntityPatch
> = {
  kind: "entity",
  entity: "Entity",
  label: (row) => row.name,
  toRecord: toEntityRecord,
  uniqueIndex: {
    name: "entities_case_slug_uidx",
    conflictReason: (values) =>
      `Slug "${values.slug}" already exists in this Case`,
  },
  repo: {
    get: (exec, caseId, id) => entitiesRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      entitiesRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      entitiesRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
    remove: (exec, caseId, id) => entitiesRepo.deleteInCase(exec, caseId, id),
  },
};

export const questionsTable: RemovableGraphTable<
  QuestionRow,
  QuestionRecord,
  Omit<NewQuestion, "caseId">,
  QuestionPatch
> = {
  kind: "question",
  entity: "Question",
  label: (row) => row.text,
  toRecord: toQuestionRecord,
  repo: {
    get: (exec, caseId, id) => questionsRepo.getInCase(exec, caseId, id),
    insert: (exec, caseId, values) =>
      questionsRepo.create(exec, { ...values, caseId }),
    update: (exec, caseId, id, patch, expectedVersion) =>
      questionsRepo.updateInCase(exec, caseId, id, patch, expectedVersion),
    remove: (exec, caseId, id) => questionsRepo.deleteInCase(exec, caseId, id),
  },
};

/** An open Question is resolved; `status = 'open'` is in the UPDATE, so of two concurrent resolves one matches. */
export const resolveQuestion: GraphTransition<
  QuestionRow,
  ResolveQuestionValues
> = {
  verb: "resolved",
  conflict: "Question already resolved",
  fromValue: "open",
  toValue: "resolved",
  apply: (exec, caseId, id, set) =>
    questionsRepo.resolveInCase(exec, caseId, id, set),
};

/** A resolved Question is reopened. Reopening is an `updated` entry (the verb vocabulary has no `reopened`). */
export const reopenQuestion: GraphTransition<QuestionRow, null> = {
  verb: "updated",
  conflict: "Question is already open",
  fromValue: "resolved",
  toValue: "open",
  apply: (exec, caseId, id) => questionsRepo.reopenInCase(exec, caseId, id),
};
