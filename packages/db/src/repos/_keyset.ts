import { sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";

/*
 * Keyset ("seek") pagination: the page after a row is the rows that sort after its sort key, so
 * a page costs the same on page 500 as on page 1 and an insert between two page requests moves
 * nothing. Every paged list orders by its sort columns and then by the row's id, so the order is
 * total and stable; all columns run in one direction, so the whole key compares as one row.
 *
 * Raw `sql` by necessity (row comparison, a timestamp as text): the helper lives here, outside
 * `*.repo.ts`, for the reason `_evidence-ids.ts` does, so `watchdog/db-repo-no-raw-sql` keeps the
 * repos on the builder API.
 *
 * Timestamps are the catch. Postgres keeps microseconds, a JavaScript `Date` keeps milliseconds,
 * so a cursor built from a `Date` would put a row back inside its own page whenever two rows share
 * a millisecond (a Proposal accept creates many in one transaction). A paged list therefore
 * selects its time key as text beside the row (`timeKey`), the cursor carries that text, and the
 * next page compares against it: the cursor holds the value the row had when the page was read,
 * never a re-read of the row, so a row updated between two pages does not move the cursor.
 */

/** Where a page starts: the sort-key values of the last row of the previous page, then its id. */
export type KeysetAfter = {
  readonly values: readonly (string | number)[];
  readonly id: string;
};

/** A sort column of a paged list. `time` marks a timestamp, whose cursor value is `timeKey` text. */
export type KeyColumn = {
  readonly column: AnyColumn;
  readonly time?: true;
};

export type KeysetOptions = {
  readonly idColumn: AnyColumn;
  /** The sort columns before the id, in order; their values are `after.values`, in order. */
  readonly keys: readonly KeyColumn[];
  readonly direction: "asc" | "desc";
  readonly after: KeysetAfter | undefined;
};

/**
 * A timestamp column as ISO text at full (microsecond) precision: select it beside the row as
 * `keyTime` and put it in the row's cursor.
 */
export const timeKey = (column: AnyColumn | SQL) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

function keyValue(key: KeyColumn, value: string | number | undefined): SQL {
  return key.time === true ? sql`${value}::timestamptz` : sql`${value}`;
}

/**
 * The WHERE condition that keeps only the rows after the cursor, or `undefined` for the first
 * page. `after.values` has one value per key column; a cursor that does not match is a caller
 * error the service has already refused.
 */
export function keysetAfter(opts: KeysetOptions): SQL | undefined {
  const { after } = opts;
  if (after === undefined) return undefined;
  const columns = [...opts.keys.map((key) => key.column), opts.idColumn];
  const values = [
    ...opts.keys.map((key, index) => keyValue(key, after.values[index])),
    sql`${after.id}`,
  ];
  const operator = opts.direction === "asc" ? sql`>` : sql`<`;
  return sql`(${sql.join(columns, sql`, `)}) ${operator} (${sql.join(values, sql`, `)})`;
}

/*
 * Keyset v2, for declared lists (ADR-0007, `_list-query.ts`). One sort key plus the id, in ONE
 * direction chosen per request, read from one `KeysetOrder` by the WHERE (`keysetWhere`), the
 * ORDER BY (`keysetOrderBy`) and the selected cursor value (`keysetKey`), so the three cannot
 * disagree. The pair always compares as a row, `(key, id) > (v, id)` ascending or `<`
 * descending, which one btree `(scope, key, id)` serves both ways (scanned backwards for the
 * other direction).
 *
 * The key is never NULL: a NOT NULL column, or `coalesce(column, <sentinel>)` for a nullable one
 * (a NULL would make the row comparison unknown and drop the row from every page). The sentinel
 * is inlined as a literal so the expression matches its expression index.
 */

/** Where a v2 page starts: the cursor value of the previous page's last row, then its id. */
export type ListAfter = {
  readonly value: string | number;
  readonly id: string;
};

export type KeysetOrder = {
  readonly idColumn: AnyColumn;
  /** A NOT NULL column, or the `coalesce` expression `sortKeyExpr` builds. */
  readonly key: AnyColumn | SQL;
  /** A timestamp key: the cursor carries microsecond text (`timeKey`). */
  readonly isTime: boolean;
  readonly dir: "asc" | "desc";
};

/** A sentinel a nullable sort key may take; a text one is `''`, which sorts first under any collation. */
export type SortSentinel = "" | number | Date;

/** The sort key of a nullable column: `coalesce(column, <literal sentinel>)`. */
export function sortKeyExpr(column: AnyColumn, nullsAs: SortSentinel): SQL {
  if (typeof nullsAs === "number") {
    if (!Number.isSafeInteger(nullsAs)) {
      throw new TypeError(
        `sortKeyExpr: integer sentinel expected, got ${nullsAs}`
      );
    }
    return sql`coalesce(${column}, ${sql.raw(String(nullsAs))})`;
  }
  if (nullsAs instanceof Date) {
    return sql`coalesce(${column}, ${sql.raw(`'${nullsAs.toISOString()}'::timestamptz`)})`;
  }
  return sql`coalesce(${column}, '')`;
}

/** The sort key as cursor text: `timeKey` for a timestamp, the key itself otherwise. Selected as `listKey`. */
export function keysetKey(order: KeysetOrder): SQL<string | number> {
  return order.isTime ? timeKey(order.key) : sql<string | number>`${order.key}`;
}

/** `(key, id) > (v, id)` ascending or `<` descending; `undefined` on the first page. */
export function keysetWhere(
  order: KeysetOrder,
  after: ListAfter | undefined
): SQL | undefined {
  if (after === undefined) return undefined;
  const value = order.isTime
    ? sql`${after.value}::timestamptz`
    : sql`${after.value}`;
  const operator = order.dir === "asc" ? sql`>` : sql`<`;
  return sql`(${order.key}, ${order.idColumn}) ${operator} (${value}, ${after.id})`;
}

/** `[key dir, id dir]` for `.orderBy(...)`. */
export function keysetOrderBy(order: KeysetOrder): readonly [SQL, SQL] {
  const dir = order.dir === "asc" ? sql`asc` : sql`desc`;
  return [sql`${order.key} ${dir}`, sql`${order.idColumn} ${dir}`];
}
