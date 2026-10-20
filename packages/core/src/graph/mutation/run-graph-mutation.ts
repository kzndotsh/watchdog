import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import type {
  CaseId,
  GraphHistoryChannel,
  OrganizationId,
} from "@watchdog/schemas/shared";

import type { Db } from "../../infra/db-service";
import { requireWritten, tryDb } from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import {
  NotFoundError,
  type DomainTag,
  type NotFoundEntity,
} from "../../infra/tagged-errors";
import {
  appendGraphActivityEffect,
  graphActorFields,
  setHistoryContextEffect,
  type GraphActor,
} from "../graph-activity";
import {
  assertCaseInOrgEffect,
  missedVersionedUpdateEffect,
  requireTrimmedGraphId,
} from "../patch/guards";
import type { GraphTable } from "./graph-table";

export type GraphMutationScope = {
  caseId: CaseId;
  organizationId: OrganizationId;
  /** Who writes; none reads as a system write in the activity log and the history. */
  actor?: GraphActor | undefined;
  /** The door the write came through, recorded on every `graph_history` row. */
  channel: GraphHistoryChannel;
};

/**
 * The handle a mutation body writes the Graph through. Every write method is the
 * whole recipe in one call (write, miss handling, activity entry), so a write made
 * through it cannot leave out the version check or the activity entry. The
 * transaction is open and its history context is set before the body runs.
 *
 * Slice 2 (#420) adds `transition` and Evidence linking here; nothing else writes
 * a Graph row inside a mutation.
 */
export type GraphWriter = {
  /** The Case the mutation is scoped to, trimmed and checked against the organization. */
  readonly caseId: CaseId;
  /** The open transaction, for a resource rule that has to read (a parent, a duplicate). */
  readonly tx: DbTx;
  /** A row of the Case, read in the transaction. NotFound when it is not there. */
  readonly get: <Row extends { id: string; version: number }, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string
  ) => Effect.Effect<Row, DomainTag>;
  /** Append `created` and return the new row's record. */
  readonly insert: <Row extends { id: string; version: number }, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    values: Ins
  ) => Effect.Effect<Rec, DomainTag>;
  /**
   * Append `updated` and return the record. The version is in the statement's WHERE; a
   * miss is StaleVersion (with the current version) or NotFound, from a re-read in the
   * same transaction.
   */
  readonly update: <Row extends { id: string; version: number }, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string,
    patch: Pat,
    opts: { expectedVersion: number }
  ) => Effect.Effect<Rec, DomainTag>;
  /** Append `deleted` and return the record of the deleted row. NotFound when it is not there. */
  readonly remove: <Row extends { id: string; version: number }, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string
  ) => Effect.Effect<Rec, DomainTag>;
};

function trimId(
  table: { entity: NotFoundEntity },
  id: string
): Effect.Effect<string, DomainTag> {
  return requireTrimmedGraphId(id, table.entity);
}

function makeWriter(
  tx: DbTx,
  caseId: CaseId,
  actor: GraphActor | undefined
): GraphWriter {
  const fields = graphActorFields(actor);
  return {
    caseId,
    tx,
    get: (table, rawId) =>
      Effect.gen(function* getGen() {
        const id = yield* trimId(table, rawId);
        const row = yield* tryDb(() => table.repo.get(tx, caseId, id));
        if (row === null) {
          return yield* new NotFoundError({ entity: table.entity, id });
        }
        return row;
      }),
    insert: (table, values) =>
      Effect.gen(function* insertGen() {
        const created = yield* tryDb(() =>
          table.repo.insert(tx, caseId, values)
        ).pipe(requireWritten(`create ${table.entity}`));
        yield* appendGraphActivityEffect(tx, {
          ...fields,
          caseId,
          kind: table.kind,
          action: "created",
          subjectId: created.id,
          label: table.label(created),
        });
        return table.toRecord(created);
      }),
    update: (table, rawId, patch, { expectedVersion }) =>
      Effect.gen(function* updateGen() {
        const id = yield* trimId(table, rawId);
        const updated = yield* tryDb(() =>
          table.repo.update(tx, caseId, id, patch, expectedVersion)
        );
        if (updated === null) {
          const current = yield* tryDb(() => table.repo.get(tx, caseId, id));
          return yield* missedVersionedUpdateEffect(current, {
            entity: table.entity,
            id,
          });
        }
        yield* appendGraphActivityEffect(tx, {
          ...fields,
          caseId,
          kind: table.kind,
          action: "updated",
          subjectId: id,
          label: table.label(updated),
        });
        return table.toRecord(updated);
      }),
    remove: (table, rawId) =>
      Effect.gen(function* removeGen() {
        const id = yield* trimId(table, rawId);
        const deleted = yield* tryDb(() => table.repo.remove(tx, caseId, id));
        if (deleted === null) {
          return yield* new NotFoundError({ entity: table.entity, id });
        }
        yield* appendGraphActivityEffect(tx, {
          ...fields,
          caseId,
          kind: table.kind,
          action: "deleted",
          subjectId: id,
          label: table.label(deleted),
        });
        return table.toRecord(deleted);
      }),
  };
}

/**
 * The one entry point of a Graph write: checks the Case against the organization,
 * opens the transaction, sets the history context as its first statement (ADR-0005,
 * issue #303), then runs `body` with a {@link GraphWriter}. A failure anywhere rolls
 * back the rows, the history and the activity entries together. Never call it inside
 * another `transact` body (nesting is a defect); resource rules go in `body`.
 */
export function runGraphMutation<A, E extends DomainTag, R>(
  scope: GraphMutationScope,
  body: (w: GraphWriter) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.gen(function* runGraphMutationGen() {
    const caseId = yield* assertCaseInOrgEffect(
      scope.caseId,
      scope.organizationId
    );
    return yield* transact((tx) =>
      Effect.gen(function* graphMutationTx() {
        yield* setHistoryContextEffect(tx, {
          ...graphActorFields(scope.actor),
          channel: scope.channel,
        });
        return yield* body(makeWriter(tx, caseId, scope.actor));
      })
    );
  });
}
