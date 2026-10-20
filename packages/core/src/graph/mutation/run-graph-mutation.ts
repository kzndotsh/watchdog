import { Effect } from "effect";

import type { DbTx } from "@watchdog/db";
import type {
  CaseId,
  GraphHistoryChannel,
  OrganizationId,
  GraphActor,
} from "@watchdog/schemas/shared";

import {
  assertEvidenceIdsInCaseEffect,
  parseGraphEvidenceIdsEffect,
} from "../../evidence/evidence";
import type { Db } from "../../infra/db-service";
import {
  requireWritten,
  tryDb,
  type MapPostgresCatchOpts,
} from "../../infra/postgres-effect";
import { transact } from "../../infra/postgres-tx";
import {
  ConflictError,
  InternalError,
  InvalidError,
  NotFoundError,
  StaleVersionError,
  type DomainTag,
  type NotFoundEntity,
  type VersionedEntity,
} from "../../infra/tagged-errors";
import {
  appendGraphActivityEffect,
  graphActorFields,
  setHistoryContextEffect,
  type GraphActivityInput,
  type GraphActivityKind,
} from "../graph-activity";
import {
  assertCaseInOrgEffect,
  requireTrimmedCaseIdEffect,
  requireTrimmedGraphId,
} from "../patch/guards";
import type {
  GraphTable,
  GraphTransition,
  RemovableGraphTable,
} from "./graph-table";

export type GraphMutationScope = {
  caseId: CaseId;
  organizationId: OrganizationId;
  /** Who writes; none reads as a system write in the activity log and the history. */
  actor?: GraphActor | undefined;
  /** The door the write came through, recorded on every `graph_history` row. */
  channel: GraphHistoryChannel;
};

type AnyRow = { id: string; version: number };

/**
 * Evidence an update ADDS to the row's links instead of replacing them (the patch update
 * path: an upsert onto an existing Identifier or Edge cites more Evidence, it never drops
 * what the row already cites). The UPDATE checks the version itself, then the ids are
 * linked (`ON CONFLICT DO NOTHING`), so a stale edit links nothing.
 */
export type AppendEvidence = {
  readonly mode: "append";
  readonly ids: readonly string[];
};

/**
 * What an update checks and links. `evidence` as a list REPLACES the links, which needs the
 * version up front (the row is locked at it); an {@link AppendEvidence} ADDS to them, and
 * the version stays optional because a patch op without one overwrites the row as it stands.
 */
export type UpdateOpts =
  | { expectedVersion: number; evidence?: readonly string[] }
  | { expectedVersion?: number | undefined; evidence?: AppendEvidence };

/** A caller-chosen id that is already taken: the primary key's index and the Conflict reason. */
export type IdInUse = { uniqueIndex: string; conflictReason: string };

/**
 * The handle a mutation body writes the Graph through. Every write method is the
 * whole recipe in one call (write, miss handling, Evidence, activity entry), so a
 * write made through it cannot leave out the version check or the activity entry. The
 * transaction is open and its history context is set before the body runs.
 */
export type GraphWriter = {
  /** The Case the mutation is scoped to, trimmed and checked against the organization. */
  readonly caseId: CaseId;
  /** The open transaction, for a resource rule that has to read (a parent, a duplicate). */
  readonly tx: DbTx;
  /** A row of the Case, read in the transaction. NotFound when it is not there. */
  readonly get: <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string
  ) => Effect.Effect<Row, DomainTag>;
  /**
   * Append `created` and return the new row's record. A table with an Evidence linker
   * links `opts.evidence` (checked to be Evidence of the Case first) and returns the row
   * read back, because linking bumps its version.
   */
  readonly insert: <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    values: Ins,
    opts?: { evidence?: readonly string[]; idInUse?: IdInUse }
  ) => Effect.Effect<Rec, DomainTag, Db>;
  /**
   * Append `updated` and return the record. The version is in the statement's WHERE; a
   * miss is StaleVersion (with the current version) or NotFound, from a re-read in the
   * same transaction. With `opts.evidence` the links are replaced: the row is locked at
   * `expectedVersion` first, so a stale edit leaves the links as they were, and `patch`
   * may be empty. With `{ mode: "append" }` the ids are added to the links instead (see
   * {@link AppendEvidence}) and `expectedVersion` may be absent.
   */
  readonly update: <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string,
    patch: Pat,
    opts: UpdateOpts
  ) => Effect.Effect<Rec, DomainTag, Db>;
  /**
   * Run a state-guarded change (retract, resolve, reopen) and append its verb, with
   * `opts.toValue`. No version is checked; a failed guard is Conflict, a missing row
   * NotFound, from a re-read in the same transaction.
   */
  readonly transition: <Row extends AnyRow, Rec, Ins, Pat, Set>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string,
    change: GraphTransition<Row, Set>,
    set: Set,
    opts?: { toValue?: string }
  ) => Effect.Effect<Rec, DomainTag>;
  /** Append `deleted` and return the record of the deleted row. NotFound when it is not there. */
  readonly remove: <Row extends AnyRow, Rec, Ins, Pat>(
    table: RemovableGraphTable<Row, Rec, Ins, Pat>,
    id: string
  ) => Effect.Effect<Rec, DomainTag>;
};

/**
 * A conditional UPDATE (the state check is in its WHERE) matched no row: Conflict when the
 * row still exists (a concurrent writer won), NotFound when it is gone. `exists` comes from
 * a re-read in the same transaction.
 */
function missedUpdate(
  exists: boolean,
  target: { entity: NotFoundEntity; id: string },
  conflictReason: string
): Effect.Effect<never, NotFoundError | ConflictError> {
  return exists
    ? Effect.fail(new ConflictError({ reason: conflictReason }))
    : Effect.fail(new NotFoundError(target));
}

/**
 * A version-checked UPDATE (`WHERE id = $1 AND version = $2`, #307) matched no row.
 * `current` is a re-read taken in the same transaction: StaleVersion, carrying the row's
 * version now, when the row still exists (another writer saved first), NotFound when it
 * is gone. Nothing was written either way.
 */
function missedVersionedUpdate(
  current: { version: number } | null,
  target: { entity: VersionedEntity; id: string }
): Effect.Effect<never, NotFoundError | StaleVersionError> {
  return current === null
    ? Effect.fail(new NotFoundError(target))
    : Effect.fail(
        new StaleVersionError({ ...target, currentVersion: current.version })
      );
}

function trimId(
  table: { entity: NotFoundEntity },
  id: string
): Effect.Effect<string, DomainTag> {
  return requireTrimmedGraphId(id, table.entity);
}

/**
 * The Conflict mapping of the table's unique index. An insert passes its `values` (a reason
 * may name them); an update has none, so it maps a fixed reason only.
 */
function uniqueIndexMapping<Row extends AnyRow, Rec, Ins, Pat>(
  table: GraphTable<Row, Rec, Ins, Pat>,
  values?: Ins
): MapPostgresCatchOpts | undefined {
  const { uniqueIndex } = table;
  if (uniqueIndex === undefined) return undefined;
  const { conflictReason } = uniqueIndex;
  if (typeof conflictReason === "string") {
    return { uniqueIndex: uniqueIndex.name, conflictReason };
  }
  return values === undefined
    ? undefined
    : { uniqueIndex: uniqueIndex.name, conflictReason: conflictReason(values) };
}

/** The insert's mapping: the table's index, then the primary key when the caller chose the id. */
function insertMapping<Row extends AnyRow, Rec, Ins, Pat>(
  table: GraphTable<Row, Rec, Ins, Pat>,
  values: Ins,
  idInUse: IdInUse | undefined
): MapPostgresCatchOpts | undefined {
  const mapped = uniqueIndexMapping(table, values);
  if (idInUse === undefined) return mapped;
  return mapped === undefined ? idInUse : { ...idInUse, also: mapped };
}

/**
 * `settle` says whether a write that links Evidence reads its row back for the record: linking
 * bumps the version, so without the read-back the record carries the version before the links.
 * The joined writer does not settle (its type drops `version`, see {@link JoinedGraphWriter});
 * the module's own writer does.
 */
function makeCore(
  tx: DbTx,
  caseId: CaseId,
  actor: GraphActor | undefined,
  verified: ReadonlySet<string>,
  settle: boolean
): GraphWriter {
  const fields = graphActorFields(actor);

  const append = <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    action: GraphActivityInput<GraphActivityKind>["action"],
    row: Row,
    values: {
      fromValue?: string | undefined;
      toValue?: string | undefined;
    } = {}
  ) =>
    appendGraphActivityEffect(tx, {
      ...fields,
      caseId,
      kind: table.kind,
      action,
      subjectId: row.id,
      label: table.label(row),
      ...(values.fromValue === undefined
        ? {}
        : { fromValue: values.fromValue }),
      ...(values.toValue === undefined ? {} : { toValue: values.toValue }),
    });

  /** The record of `row`, with the table's linked Evidence read in this transaction. */
  const record = <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    row: Row
  ): Effect.Effect<Rec, DomainTag> =>
    Effect.gen(function* recordGen() {
      const { evidence } = table;
      if (evidence === undefined) return table.toRecord(row, []);
      const byRow = yield* tryDb(() => evidence.list(tx, [row.id]));
      return table.toRecord(row, byRow.get(row.id) ?? []);
    });

  const readBack = <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string
  ) =>
    tryDb(() => table.repo.get(tx, caseId, id)).pipe(
      requireWritten(`read ${table.entity} back`)
    );

  const missedVersion = <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string
  ) =>
    tryDb(() => table.repo.get(tx, caseId, id)).pipe(
      Effect.flatMap((current) =>
        missedVersionedUpdate(current, { entity: table.entity, id })
      )
    );

  /** The parsed ids, each checked to be Evidence of the Case unless the caller verified it up front. */
  const checkedEvidence = (raw: readonly string[]) =>
    Effect.gen(function* checkedEvidenceGen() {
      const ids = yield* parseGraphEvidenceIdsEffect(raw);
      const unverified = ids.filter((id) => !verified.has(id));
      if (unverified.length > 0) {
        yield* assertEvidenceIdsInCaseEffect(caseId, unverified, tx);
      }
      return ids;
    });

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
    insert: (table, values, opts) =>
      Effect.gen(function* insertGen() {
        const { evidence } = table;
        const ids =
          evidence === undefined
            ? []
            : yield* checkedEvidence(opts?.evidence ?? []);
        const created = yield* tryDb(
          () => table.repo.insert(tx, caseId, values),
          insertMapping(table, values, opts?.idInUse)
        ).pipe(requireWritten(`create ${table.entity}`));
        yield* append(table, "created", created);
        if (evidence === undefined) return table.toRecord(created, []);
        yield* tryDb(() => evidence.link(tx, caseId, created.id, ids)).pipe(
          requireWritten("link evidence")
        );
        if (!settle) return table.toRecord(created, ids);
        // Linking Evidence touches the row (a version bump): return it as it now stands.
        return table.toRecord(yield* readBack(table, created.id), ids);
      }),
    update: (table, rawId, patch, { expectedVersion, evidence: raw }) =>
      Effect.gen(function* updateGen() {
        const id = yield* trimId(table, rawId);
        const { evidence } = table;
        if (raw !== undefined && "mode" in raw && evidence !== undefined) {
          // Appending links bumps the version after the UPDATE has checked it: a stale
          // edit misses here and links nothing.
          const ids = yield* checkedEvidence(raw.ids);
          const written = yield* tryDb(
            () => table.repo.update(tx, caseId, id, patch, expectedVersion),
            uniqueIndexMapping(table)
          );
          if (written === null) return yield* missedVersion(table, id);
          yield* tryDb(() => evidence.link(tx, caseId, id, ids)).pipe(
            requireWritten("link evidence")
          );
          if (!settle) {
            yield* append(table, "updated", written);
            return table.toRecord(written, ids);
          }
          const settled = yield* readBack(table, id);
          yield* append(table, "updated", settled);
          return yield* record(table, settled);
        }
        if (raw !== undefined && !("mode" in raw) && evidence !== undefined) {
          // Replacing links bumps the version, so the version is checked first, by taking
          // the row's lock only if it is still at `expectedVersion`.
          if (expectedVersion === undefined) {
            return yield* new InternalError({
              reason: "Replacing evidence needs an expected version",
            });
          }
          const locked = yield* tryDb(() =>
            evidence.lockAtVersion(tx, caseId, id, expectedVersion)
          );
          if (!locked) return yield* missedVersion(table, id);
          const ids = yield* checkedEvidence(raw);
          const replaced = yield* tryDb(() =>
            evidence.replace(tx, caseId, id, ids)
          );
          if (replaced === null) {
            return yield* new InvalidError({ reason: "Invalid evidence id" });
          }
          // The row is locked at the checked version, so this UPDATE has no version of its own.
          const written = yield* tryDb(
            () => table.repo.update(tx, caseId, id, patch),
            uniqueIndexMapping(table)
          );
          if (written === null) return yield* missedVersion(table, id);
          const settled = yield* readBack(table, id);
          yield* append(table, "updated", settled);
          return table.toRecord(settled, replaced);
        }
        const updated = yield* tryDb(
          () => table.repo.update(tx, caseId, id, patch, expectedVersion),
          uniqueIndexMapping(table)
        );
        if (updated === null) return yield* missedVersion(table, id);
        yield* append(table, "updated", updated);
        return yield* record(table, updated);
      }),
    transition: (table, rawId, change, set, opts) =>
      Effect.gen(function* transitionGen() {
        const id = yield* trimId(table, rawId);
        const moved = yield* tryDb(() => change.apply(tx, caseId, id, set));
        if (moved === null) {
          const current = yield* tryDb(() => table.repo.get(tx, caseId, id));
          return yield* missedUpdate(
            current !== null,
            { entity: table.entity, id },
            change.conflict
          );
        }
        yield* append(table, change.verb, moved, {
          fromValue: change.fromValue,
          toValue: opts?.toValue ?? change.toValue,
        });
        return yield* record(table, moved);
      }),
    remove: (table, rawId) =>
      Effect.gen(function* removeGen() {
        const id = yield* trimId(table, rawId);
        const deleted = yield* tryDb(() => table.repo.remove(tx, caseId, id));
        if (deleted === null) {
          return yield* new NotFoundError({ entity: table.entity, id });
        }
        yield* append(table, "deleted", deleted);
        return table.toRecord(deleted, []);
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
        return yield* body(makeCore(tx, caseId, scope.actor, new Set(), true));
      })
    );
  });
}

/** What a joined mutation needs: the Case the caller already scoped, and who writes. */
export type GraphJoinScope = {
  caseId: CaseId;
  /** Who writes; the activity entries carry it. The history context already does (the caller set it). */
  actor?: GraphActor | undefined;
  /**
   * Every Evidence id the whole mutation cites, such as all ids of a patch. The module checks
   * them once, up front, to be Evidence of the Case; a write that cites only these skips its
   * own check. A write that cites any other id is still checked, so the guarantee is the
   * module's whatever the body does.
   */
  evidenceIds?: readonly string[];
};

/**
 * The writer of a joined mutation. Its `insert` and `update` return the record as written, minus
 * `version`: the joined path does not read a row back after linking Evidence (a patch ignores the
 * record, and the read-back is a statement per op on the Accept hot path), so the version it
 * would carry could be stale.
 */
export type JoinedGraphWriter = Omit<GraphWriter, "insert" | "update"> & {
  readonly insert: <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    values: Ins,
    opts?: { evidence?: readonly string[]; idInUse?: IdInUse }
  ) => Effect.Effect<Omit<Rec, "version">, DomainTag, Db>;
  readonly update: <Row extends AnyRow, Rec, Ins, Pat>(
    table: GraphTable<Row, Rec, Ins, Pat>,
    id: string,
    patch: Pat,
    opts: UpdateOpts
  ) => Effect.Effect<Omit<Rec, "version">, DomainTag, Db>;
};

/**
 * The join path of {@link runGraphMutation}, for a write that is one step of a larger
 * transaction (Triage Accept, the agent graph write). Contract:
 *
 * - It runs `body` on the caller's `tx` and opens no transaction: nesting `transact` is a
 *   defect, so a caller inside one never uses {@link runGraphMutation}.
 * - It does NOT set the history context. The caller set it as the first statement of `tx`
 *   (`setHistoryContextEffect`, with the channel `triage_accept` or `agent_write`), and a
 *   second set would overwrite the caller's.
 * - It does NOT check the Case against an organization: the caller scoped it.
 * - It checks `scope.evidenceIds` once, then the body's writes check only the ids outside that set.
 * - A failure leaves the rollback to the caller's transaction, which also covers the rows and
 *   activity entries written before it.
 */
export function runGraphMutationInTx<A, E extends DomainTag, R>(
  tx: DbTx,
  scope: GraphJoinScope,
  body: (w: JoinedGraphWriter) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | DomainTag, R | Db> {
  return Effect.gen(function* runGraphMutationInTxGen() {
    const caseId = yield* requireTrimmedCaseIdEffect(scope.caseId);
    const evidenceIds = yield* parseGraphEvidenceIdsEffect(
      scope.evidenceIds ?? []
    );
    if (evidenceIds.length > 0) {
      yield* assertEvidenceIdsInCaseEffect(caseId, evidenceIds, tx);
    }
    return yield* body(
      makeCore(tx, caseId, scope.actor, new Set(evidenceIds), false)
    );
  });
}
