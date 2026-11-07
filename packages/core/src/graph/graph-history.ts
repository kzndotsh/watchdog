import { Effect } from "effect";

import { graphHistoryListRepo } from "@watchdog/db";
import type { GraphHistoryRow } from "@watchdog/db";
import type {
  GraphHistoryAttribution,
  GraphHistoryEntry,
  GraphHistoryRowInput,
  GraphHistorySnapshot,
} from "@watchdog/schemas/graph";
import {
  graphHistoryList,
  graphHistorySnapshotSchema,
} from "@watchdog/schemas/graph";
import { opsOf } from "@watchdog/schemas/shared";
import type {
  CaseId,
  GraphHistoryKind,
  ListInput,
  ListPage,
  OrganizationId,
} from "@watchdog/schemas/shared";

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import { assertCaseInOrgEffect, requireTrimmedGraphId } from "../cases/access";
import {
  type NotFoundEntity,
  NotFoundError,
  type DomainTag,
} from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { listCappedEffect, listPageEffect } from "../infra/list-page";
import {
  claimsRepoFxDb,
  edgesRepoFxDb,
  entitiesRepoFxDb,
  eventsRepoFxDb,
  identifiersRepoFxDb,
  questionsRepoFxDb,
  tasksRepoFxDb,
} from "../infra/repos-fx";

/**
 * The read side of `graph_history`. The table is written only by the database
 * triggers (`0001_database_logic`); who and through which door
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
  caseId: CaseId,
  kind: GraphHistoryKind,
  rowId: string
): Effect.Effect<AuditedRow | null, DomainTag, Db> {
  switch (kind) {
    case "entity": {
      return entitiesRepoFxDb.getInCase(caseId, rowId);
    }
    case "edge": {
      return edgesRepoFxDb.getInCase(caseId, rowId);
    }
    case "claim": {
      return claimsRepoFxDb.getInCase(caseId, rowId);
    }
    case "identifier": {
      return identifiersRepoFxDb.getInCase(caseId, rowId);
    }
    case "event": {
      return eventsRepoFxDb.getInCase(caseId, rowId);
    }
    case "question": {
      return questionsRepoFxDb.getInCase(caseId, rowId);
    }
    case "task": {
      return tasksRepoFxDb.getInCase(caseId, rowId);
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

/** Whether the row has any history entry in the Case: one row read, no count. */
function hasEntryEffect(
  caseId: CaseId,
  kind: GraphHistoryKind,
  rowId: string
): Effect.Effect<boolean, DomainTag, Db> {
  return listCappedEffect({
    def: graphHistoryList,
    repo: graphHistoryListRepo,
    scope: { caseId, kind, rowId },
    query: opsOf(graphHistoryList).queryOf({}),
    cap: 1,
    toItems: (rows) => Effect.succeed(rows),
  }).pipe(Effect.map((found) => found.items.length > 0));
}

function entriesOfRowsEffect(
  rows: readonly GraphHistoryRow[]
): Effect.Effect<readonly GraphHistoryEntry[], DomainTag, Db> {
  return Effect.gen(function* entriesOfRowsGen() {
    const users = yield* loadActorUsersEffect(rows.map((row) => row.actorId));
    return rows.map((row) =>
      toEntry(
        row,
        row.actorId === null
          ? null
          : labelForActor(row.actorId, users, row.actorLabel)
      )
    );
  });
}

/**
 * One Graph row's history (`graphHistoryList`, ADR-0007): a page of its entries, newest first.
 * Case-scoped and organization-scoped like every Case child read: a foreign or missing Case is
 * `not_found`, and so is a row with no live row and no entry in this Case. The history of a
 * deleted row stays readable by its id.
 */
export function listGraphHistoryEffect(
  organizationId: OrganizationId,
  input: ListInput<typeof graphHistoryList>
): Effect.Effect<ListPage<GraphHistoryEntry>, DomainTag, Db> {
  return Effect.gen(function* listGraphHistoryGen() {
    const caseId = yield* assertCaseInOrgEffect(input.caseId, organizationId);
    const rowId = yield* requireTrimmedGraphId(
      input.rowId,
      NOT_FOUND_ENTITY[input.kind]
    );
    const page = yield* listPageEffect({
      def: graphHistoryList,
      repo: graphHistoryListRepo,
      scope: { caseId, kind: input.kind, rowId },
      input,
      toItems: entriesOfRowsEffect,
    });
    // An empty page is fine past the end of a deleted row's history; a row this Case never had
    // (no live row, no entry) is not found, with a cursor or without.
    if (page.items.length === 0) {
      const live = yield* liveRowInCase(caseId, input.kind, rowId);
      if (
        live === null &&
        !(yield* hasEntryEffect(caseId, input.kind, rowId))
      ) {
        return yield* new NotFoundError({
          entity: NOT_FOUND_ENTITY[input.kind],
          id: rowId,
        });
      }
    }
    return page;
  });
}

/**
 * Who created and last changed one Graph row as it stands now, as display names; `null` once the
 * row is deleted (its history stays). Case-scoped like the history: a row this Case never had is
 * `not_found`.
 */
export function graphRowAttributionEffect(
  organizationId: OrganizationId,
  input: GraphHistoryRowInput
): Effect.Effect<GraphHistoryAttribution | null, DomainTag, Db> {
  return Effect.gen(function* graphRowAttributionGen() {
    const caseId = yield* assertCaseInOrgEffect(input.caseId, organizationId);
    const rowId = yield* requireTrimmedGraphId(
      input.rowId,
      NOT_FOUND_ENTITY[input.kind]
    );
    const authors = authorsOf(yield* liveRowInCase(caseId, input.kind, rowId));
    if (authors === null) {
      // Gone: its history stays, so a row with an entry here is `null`, and a row this Case never
      // had is not found, like any foreign child id.
      if (!(yield* hasEntryEffect(caseId, input.kind, rowId))) {
        return yield* new NotFoundError({
          entity: NOT_FOUND_ENTITY[input.kind],
          id: rowId,
        });
      }
      return null;
    }
    const users = yield* loadActorUsersEffect([
      authors.createdBy,
      authors.updatedBy,
    ]);
    const nameOf = (id: string | null) =>
      id === null ? null : labelForActor(id, users);
    return {
      createdBy: nameOf(authors.createdBy),
      createdAt: authors.createdAt,
      updatedBy: nameOf(authors.updatedBy),
      updatedAt: authors.updatedAt,
    };
  });
}
