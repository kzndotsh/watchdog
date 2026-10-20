import type { DbExec } from "@watchdog/db";
import type { ACTIVITY_ENTRY_ACTIONS } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";

import type { VersionedEntity } from "../../infra/tagged-errors";
import type { GraphActivityKind } from "../graph-activity";

type ActivityVerb = (typeof ACTIVITY_ENTRY_ACTIONS)[GraphActivityKind][number];

/**
 * How a table links its rows to Evidence. The repo calls are scoped by Case and take
 * the transaction the module opened; only the module's writer calls them.
 */
export type EvidenceLinker = {
  /** The linked Evidence ids of each row, by row id. */
  readonly list: (
    exec: DbExec,
    rowIds: string[]
  ) => Promise<Map<string, string[]>>;
  /** Add links to a new row; `false` when an id is malformed. */
  readonly link: (
    exec: DbExec,
    caseId: CaseId,
    rowId: string,
    evidenceIds: string[]
  ) => Promise<boolean>;
  /** Make the links exactly `evidenceIds`; the stored ids, or `null` when one is malformed. */
  readonly replace: (
    exec: DbExec,
    caseId: CaseId,
    rowId: string,
    evidenceIds: string[]
  ) => Promise<string[] | null>;
  /**
   * Take the row's lock only if it is still at `expectedVersion`. Replacing links bumps
   * the version, so the check has to come first.
   */
  readonly lockAtVersion: (
    exec: DbExec,
    caseId: CaseId,
    rowId: string,
    expectedVersion: number
  ) => Promise<boolean>;
};

/**
 * A state change guarded by the row's state (retract, resolve, reopen). The guard is in
 * the UPDATE's WHERE, there is no `expectedVersion`, and a miss is Conflict when the row
 * still exists, NotFound when it is gone. `Set` is what the change writes.
 */
export type GraphTransition<Row, Set> = {
  /** The activity verb the change appends. */
  readonly verb: ActivityVerb;
  /** The Conflict reason when the guard fails. */
  readonly conflict: string;
  readonly apply: (
    exec: DbExec,
    caseId: CaseId,
    id: string,
    set: Set
  ) => Promise<Row | null>;
};

/**
 * What the Graph mutation module needs to know about one Graph table: the activity
 * kind its writes append, the label a row gets in the activity log, how a row maps
 * to the record the API returns, and the repo calls that read and write it. The
 * repo methods are scoped by Case and take the transaction the module opened; they
 * return `null` on a miss, which the module turns into NotFound, StaleVersion or an
 * Internal failure. Descriptors live in `tables.ts`, the one place that calls a Graph
 * repo write.
 *
 * `Row` is the repo row, `Rec` the record, `Ins` the values of a new row (without the
 * Case), `Pat` the columns an update sets.
 */
export type GraphTable<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
> = {
  readonly kind: GraphActivityKind;
  /** The entity named by NotFound and StaleVersion. */
  readonly entity: VersionedEntity;
  /** The activity label of a row: its name, text or predicate. */
  readonly label: (row: Row) => string;
  /** `evidenceIds` is the row's linked Evidence (empty for a table without a linker). */
  readonly toRecord: (row: Row, evidenceIds: readonly string[]) => Rec;
  /** Present when rows cite Evidence. */
  readonly evidence?: EvidenceLinker;
  readonly repo: {
    readonly get: (
      exec: DbExec,
      caseId: CaseId,
      id: string
    ) => Promise<Row | null>;
    readonly insert: (
      exec: DbExec,
      caseId: CaseId,
      values: Ins
    ) => Promise<Row | null>;
    /** `version = expectedVersion` is part of the WHERE; without one, only the id is. */
    readonly update: (
      exec: DbExec,
      caseId: CaseId,
      id: string,
      patch: Pat,
      expectedVersion?: number
    ) => Promise<Row | null>;
    /** Returns the deleted row. Absent for a table whose rows are never deleted. */
    readonly remove?: (
      exec: DbExec,
      caseId: CaseId,
      id: string
    ) => Promise<Row | null>;
  };
};

/** A table whose rows can be deleted. */
export type RemovableGraphTable<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
> = GraphTable<Row, Rec, Ins, Pat> & {
  readonly repo: {
    readonly remove: (
      exec: DbExec,
      caseId: CaseId,
      id: string
    ) => Promise<Row | null>;
  };
};

export function isRemovable<
  Row extends { id: string; version: number },
  Rec,
  Ins,
  Pat,
>(
  table: GraphTable<Row, Rec, Ins, Pat>
): table is RemovableGraphTable<Row, Rec, Ins, Pat> {
  return table.repo.remove !== undefined;
}
