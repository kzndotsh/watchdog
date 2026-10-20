import type { DbExec } from "@watchdog/db";
import type { CaseId } from "@watchdog/schemas/shared";

import type { VersionedEntity } from "../../infra/tagged-errors";
import type { GraphActivityKind } from "../graph-activity";

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
  readonly toRecord: (row: Row) => Rec;
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
    /** `version = expectedVersion` is part of the statement's WHERE. */
    readonly update: (
      exec: DbExec,
      caseId: CaseId,
      id: string,
      patch: Pat,
      expectedVersion: number
    ) => Promise<Row | null>;
    /** Returns the deleted row. */
    readonly remove: (
      exec: DbExec,
      caseId: CaseId,
      id: string
    ) => Promise<Row | null>;
  };
};
