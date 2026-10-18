import { Effect } from "effect";

import {
  claimsRepo,
  edgesRepo,
  entitiesRepo,
  eventsRepo,
  graphHistoryRepo,
  identifiersRepo,
  questionsRepo,
  tasksRepo,
  type CascadedGraphRow,
  type DbExec,
  type GraphHistoryRow,
  type GraphHistorySnapshotJson,
} from "@watchdog/db";
import type {
  GraphHistoryEntry,
  GraphHistoryPage,
  ListGraphHistoryInput,
} from "@watchdog/schemas/graph";
import {
  graphHistorySnapshotSchema,
  parseGraphHistoryCursor,
} from "@watchdog/schemas/graph";
import type {
  CaseId,
  GraphHistoryChannel,
  GraphHistoryKind,
  GraphHistoryOp,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { actorLabelForPersist } from "../actors/actor-label-snapshot";
import { optionalActorId } from "../actors/require-actor-id";
import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import type { Db } from "../infra/db-service";
import { requireWritten, tryDb, tryDbWith } from "../infra/postgres-effect";
import {
  InvalidError,
  type NotFoundEntity,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, requireTrimmedGraphId } from "./patch/guards";

export type GraphSnapshot = GraphHistorySnapshotJson;

/**
 * What a write path tells `appendGraphActivityEffect` about the row it changed:
 * the row as it was (`captureGraphRowEffect` before the write, `null` for a
 * create). The "after" is read back inside the same transaction.
 */
export type GraphHistoryChange = {
  before: GraphSnapshot | null;
  /** Defaults to `dossier` for a caller and `system` for a write with no actor. */
  channel?: GraphHistoryChannel;
};

const NOT_FOUND_ENTITY: Record<GraphHistoryKind, NotFoundEntity> = {
  entity: "Entity",
  edge: "Edge",
  claim: "Claim",
  identifier: "Identifier",
  event: "Event",
  question: "Question",
  task: "Task",
};

/**
 * Columns that change on every write and say nothing about content: they are
 * kept in the snapshots but never listed as a changed field.
 */
const NOISE_FIELDS: ReadonlySet<string> = new Set(["updatedAt", "updatedBy"]);

/** The history op for an activity verb (the one vocabulary every write path already speaks). */
export function historyOpForAction(action: string): GraphHistoryOp {
  switch (action) {
    case "created": {
      return "create";
    }
    case "deleted": {
      return "delete";
    }
    case "retracted": {
      return "retract";
    }
    default: {
      return "update";
    }
  }
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Field names whose value differs between two snapshots (a create or delete
 * lists every field the present side holds), sorted, without the audit noise
 * of `updatedAt` / `updatedBy`. Keys compare as JSON, so a Date and its ISO
 * text agree.
 */
export function changedFields(
  before: GraphSnapshot | null,
  after: GraphSnapshot | null
): string[] {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  return [...keys]
    .filter((key) => !NOISE_FIELDS.has(key))
    .filter((key) => !sameJson(before?.[key], after?.[key]))
    .sort();
}

/**
 * Lock the row and return it as it is now, the "before" of the write that
 * follows. Taking the lock first makes two concurrent edits chain
 * (`v0 -> v1`, `v1 -> v2`) instead of both recording `v0` as their before.
 */
export function captureGraphRowEffect(
  tx: DbExec,
  kind: GraphHistoryKind,
  rowId: string
): Effect.Effect<GraphSnapshot, DomainTag> {
  return Effect.gen(function* captureGraphRowGen() {
    const snapshot = yield* tryDb(() =>
      graphHistoryRepo.snapshot(tx, kind, rowId, { lock: true })
    );
    if (snapshot === null) {
      return yield* new NotFoundError({
        entity: NOT_FOUND_ENTITY[kind],
        id: rowId,
      });
    }
    return snapshot;
  });
}

export type RecordGraphHistoryInput = {
  caseId: CaseId;
  kind: GraphHistoryKind;
  rowId: string;
  op: GraphHistoryOp;
  channel?: GraphHistoryChannel;
  actorId?: string | null;
  actorLabel?: string | null;
  before: GraphSnapshot | null;
};

/** The channel a write is recorded under when its path did not say. */
function channelFor(
  channel: GraphHistoryChannel | undefined,
  actorId: string | undefined
): GraphHistoryChannel {
  return channel ?? (actorId === undefined ? "system" : "dossier");
}

/**
 * Append one `graph_history` row on the caller's transaction. A delete records
 * only `before`; every other op reads the row back (inside the transaction, so
 * it is the state this write produced). Called through
 * `appendGraphActivityEffect`, never directly by a write path, except for the
 * rows a delete cascades to.
 */
export function recordGraphHistoryEffect(
  tx: DbExec,
  input: RecordGraphHistoryInput
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* recordGraphHistoryGen() {
    const actorId = optionalActorId(input.actorId);
    const after =
      input.op === "delete"
        ? null
        : yield* tryDb(() =>
            graphHistoryRepo.snapshot(tx, input.kind, input.rowId)
          ).pipe(requireWritten(`read back ${input.kind} for history`));
    yield* tryDb(() =>
      graphHistoryRepo.append(tx, {
        caseId: input.caseId,
        kind: input.kind,
        rowId: input.rowId,
        op: input.op,
        channel: channelFor(input.channel, actorId),
        actorId: actorId ?? null,
        actorLabel: actorLabelForPersist(input.actorLabel),
        before: input.before,
        after,
      })
    ).pipe(requireWritten(`record ${input.kind} history`));
  });
}

/** Rows that deleting an Entity removes or unlinks, captured before it goes. */
export type EntityDependents = {
  deleted: CascadedGraphRow[];
  unlinked: CascadedGraphRow[];
};

/** Lock and capture everything an Entity delete cascades to, before the delete. */
export function captureEntityDependentsEffect(
  tx: DbExec,
  entityId: string
): Effect.Effect<EntityDependents, DomainTag> {
  return tryDb(() => graphHistoryRepo.lockEntityDependents(tx, entityId));
}

/**
 * Record the history rows of an Entity delete's cascade, after the delete ran:
 * a `delete` for each Claim, Identifier, Event, Question and Edge that went with
 * it, and an `update` for each Task that was unlinked. Same transaction, same
 * actor and channel as the Entity's own row.
 */
export function recordEntityCascadeHistoryEffect(
  tx: DbExec,
  base: Pick<
    RecordGraphHistoryInput,
    "caseId" | "channel" | "actorId" | "actorLabel"
  >,
  dependents: EntityDependents
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* recordCascadeGen() {
    for (const row of dependents.deleted) {
      yield* recordGraphHistoryEffect(tx, {
        ...base,
        kind: row.kind,
        rowId: row.id,
        op: "delete",
        before: row.snapshot,
      });
    }
    for (const row of dependents.unlinked) {
      yield* recordGraphHistoryEffect(tx, {
        ...base,
        kind: row.kind,
        rowId: row.id,
        op: "update",
        before: row.snapshot,
      });
    }
  });
}

const textOrNull = (value: unknown) =>
  typeof value === "string" ? value : null;
const isoOrEmpty = (value: unknown) =>
  value instanceof Date ? value.toISOString() : "";

/** The authorship columns of a live row snapshot, or `null` when the row is gone. */
function authorsOf(live: GraphSnapshot | null): {
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
} | null {
  if (live === null) return null;
  return {
    createdBy: textOrNull(live.createdBy),
    createdAt: isoOrEmpty(live.createdAt),
    updatedBy: textOrNull(live.updatedBy),
    updatedAt: isoOrEmpty(live.updatedAt),
  };
}

function liveRowInCase(
  exec: DbExec,
  caseId: CaseId,
  kind: GraphHistoryKind,
  rowId: string
): Promise<object | null> {
  switch (kind) {
    case "entity": {
      return entitiesRepo.getInCase(exec, caseId, rowId);
    }
    case "edge": {
      return edgesRepo.getInCase(exec, caseId, rowId);
    }
    case "claim": {
      return claimsRepo.getInCase(exec, caseId, rowId);
    }
    case "identifier": {
      return identifiersRepo.getInCase(exec, caseId, rowId);
    }
    case "event": {
      return eventsRepo.getInCase(exec, caseId, rowId);
    }
    case "question": {
      return questionsRepo.getInCase(exec, caseId, rowId);
    }
    case "task": {
      return tasksRepo.getInCase(exec, caseId, rowId);
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** A live Graph row of this kind in the Case, or `NotFoundError` (its history may be gone with it). */
function assertRowInCaseEffect(
  caseId: CaseId,
  kind: GraphHistoryKind,
  rowId: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* assertRowInCaseGen() {
    const found = yield* tryDbWith((exec) =>
      liveRowInCase(exec, caseId, kind, rowId)
    );
    if (found === null) {
      return yield* new NotFoundError({
        entity: NOT_FOUND_ENTITY[kind],
        id: rowId,
      });
    }
  });
}

/** A stored snapshot as the wire's JSON object (jsonb read back is JSON already; this checks it). */
function toWireSnapshot(
  snapshot: GraphSnapshot | null
): GraphHistoryEntry["before"] {
  return snapshot === null ? null : graphHistorySnapshotSchema.parse(snapshot);
}

function toEntry(
  row: GraphHistoryRow,
  actorName: string | null
): GraphHistoryEntry {
  return {
    id: row.id,
    caseId: row.caseId,
    kind: row.kind,
    rowId: row.rowId,
    op: row.op,
    channel: row.channel,
    actorId: row.actorId,
    actorName,
    actorLabel: row.actorLabel,
    before: toWireSnapshot(row.before),
    after: toWireSnapshot(row.after),
    changedFields: changedFields(row.before, row.after),
    at: row.at.toISOString(),
  };
}

/**
 * One Graph row's history, newest first, paginated by cursor. Case-scoped and
 * organization-scoped like every Case child read: a foreign or missing Case is
 * `not_found`. The history of a deleted row stays readable by its id.
 */
export function listGraphHistoryEffect(
  organizationId: OrganizationId,
  input: ListGraphHistoryInput
): Effect.Effect<GraphHistoryPage, DomainTag, Db> {
  return Effect.gen(function* listGraphHistoryGen() {
    const caseId = yield* assertCaseInOrgEffect(input.caseId, organizationId);
    const rowId = yield* requireTrimmedGraphId(
      input.rowId,
      NOT_FOUND_ENTITY[input.kind]
    );
    let beforeId: number | undefined;
    if (input.cursor !== undefined) {
      const parsed = parseGraphHistoryCursor(input.cursor);
      if (parsed === null) {
        return yield* new InvalidError({ reason: "Invalid history cursor" });
      }
      beforeId = parsed;
    }
    const rows = yield* tryDbWith((exec) =>
      graphHistoryRepo.listForRow(exec, {
        caseId,
        kind: input.kind,
        rowId,
        beforeId,
        limit: input.limit + 1,
      })
    );
    if (rows.length === 0 && beforeId === undefined) {
      // No history: either a row from before history began (an empty page) or
      // an id that is not this Case's (not found, like any foreign child id).
      yield* assertRowInCaseEffect(caseId, input.kind, rowId);
    }
    const page = rows.slice(0, input.limit);
    const live = yield* tryDbWith((exec) =>
      graphHistoryRepo.snapshot(exec, input.kind, rowId)
    );
    const authors = authorsOf(live);
    const users = yield* loadActorUsersEffect([
      ...page.map((row) => row.actorId),
      authors?.createdBy,
      authors?.updatedBy,
    ]);
    const last = page.at(-1);
    const nameOf = (id: string | null) =>
      id === null ? null : labelForActor(id, users);
    return {
      attribution:
        authors === null
          ? null
          : {
              createdBy: nameOf(authors.createdBy),
              createdAt: authors.createdAt,
              updatedBy: nameOf(authors.updatedBy),
              updatedAt: authors.updatedAt,
            },
      entries: page.map((row) =>
        toEntry(
          row,
          row.actorId === null
            ? null
            : labelForActor(row.actorId, users, row.actorLabel)
        )
      ),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? String(last.id)
          : null,
    };
  });
}
