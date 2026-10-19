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
  type DbExec,
  type GraphHistoryRow,
} from "@watchdog/db";
import type {
  GraphHistoryEntry,
  GraphHistoryPage,
  GraphHistorySnapshot,
  ListGraphHistoryInput,
} from "@watchdog/schemas/graph";
import {
  graphHistorySnapshotSchema,
  parseGraphHistoryCursor,
} from "@watchdog/schemas/graph";
import type {
  CaseId,
  GraphHistoryKind,
  OrganizationId,
} from "@watchdog/schemas/shared";

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import {
  InvalidError,
  type NotFoundEntity,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { assertCaseInOrgEffect, requireTrimmedGraphId } from "./patch/guards";

/**
 * The read side of `graph_history`. The table is written only by the database
 * triggers (migration `graph_history_triggers`); who and through which door
 * come from `setHistoryContextEffect` (`graph-activity.ts`), called first in
 * every Graph write transaction.
 */

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
const NOISE_FIELDS: ReadonlySet<string> = new Set([
  "updatedAt",
  "updatedBy",
  "version",
]);

function camelCase(key: string): string {
  return key.replaceAll(/_([a-z0-9])/g, (_, char: string) =>
    char.toUpperCase()
  );
}

/**
 * A stored snapshot (the database's `to_jsonb`: snake_case keys) as the wire's
 * JSON object with camelCase keys, the shape the Dossier and the API use.
 */
export function toWireSnapshot(
  snapshot: Record<string, unknown> | null
): GraphHistorySnapshot | null {
  if (snapshot === null) return null;
  return graphHistorySnapshotSchema.parse(
    Object.fromEntries(
      Object.entries(snapshot).map(([key, value]) => [camelCase(key), value])
    )
  );
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Field names whose value differs between two snapshots (a create or delete
 * lists every field the present side holds), sorted, without the audit noise
 * of `updatedAt` / `updatedBy`.
 */
export function changedFields(
  before: GraphHistorySnapshot | null,
  after: GraphHistorySnapshot | null
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

/** The columns every live Graph row has for its authors. */
type AuditedRow = {
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** The authorship columns of a live row, or `null` when the row is gone. */
function authorsOf(live: AuditedRow | null): {
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
} | null {
  if (live === null) return null;
  return {
    createdBy: live.createdBy,
    createdAt: live.createdAt.toISOString(),
    updatedBy: live.updatedBy,
    updatedAt: live.updatedAt.toISOString(),
  };
}

function liveRowInCase(
  exec: DbExec,
  caseId: CaseId,
  kind: GraphHistoryKind,
  rowId: string
): Promise<AuditedRow | null> {
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

function toEntry(
  row: GraphHistoryRow,
  actorName: string | null
): GraphHistoryEntry {
  const before = toWireSnapshot(row.before);
  const after = toWireSnapshot(row.after);
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
    before,
    after,
    changedFields: changedFields(before, after),
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
    // The live row, read through the Case: another Case's row of the same id
    // is never read, whatever the cursor.
    const live = yield* tryDbWith((exec) =>
      liveRowInCase(exec, caseId, input.kind, rowId)
    );
    if (rows.length === 0 && live === null) {
      // No entries here and no live row: a row that never had history in this
      // Case is not found, like any foreign child id. A cursor past the end of
      // a deleted row's history is an empty page, so look for any entry.
      const anyEntry =
        beforeId === undefined
          ? []
          : yield* tryDbWith((exec) =>
              graphHistoryRepo.listForRow(exec, {
                caseId,
                kind: input.kind,
                rowId,
                limit: 1,
              })
            );
      if (anyEntry.length === 0) {
        return yield* new NotFoundError({
          entity: NOT_FOUND_ENTITY[input.kind],
          id: rowId,
        });
      }
    }
    const page = rows.slice(0, input.limit);
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
