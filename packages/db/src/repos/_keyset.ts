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
export const timeKey = (column: AnyColumn) =>
  sql<string>`to_char(${column} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** A page row carries the text of its time key (`keyTime`) for the cursor. */
export type KeyedRow<Row> = Row & { readonly keyTime: string };

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
