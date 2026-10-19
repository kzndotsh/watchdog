import { sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

/*
 * Keyset ("seek") pagination: the page after a row is the rows that sort after its sort key, so
 * a page costs the same on page 500 as on page 1 and an insert between two page requests moves
 * nothing. Every paged list orders by its sort columns and then by the row's id, so the order is
 * total and stable; all columns run in one direction, so the whole key compares as one row.
 *
 * Raw `sql` by necessity (row comparison, coalesce): the helper lives here, outside `*.repo.ts`,
 * for the reason `_evidence-ids.ts` does, so `watchdog/db-repo-no-raw-sql` keeps the repos on the
 * builder API.
 *
 * Timestamps are the catch. Postgres keeps microseconds, a JavaScript `Date` (and so a cursor
 * built from a row) keeps milliseconds, so a cursor that carried a timestamp would put the row
 * back inside its own page whenever two rows share a millisecond (a Proposal accept creates many
 * in one transaction). A time key is therefore read back from the cursor's row by id, at full
 * precision; the cursor's own value is only the fallback for a row deleted between two pages.
 */

/** Where a page starts: the sort-key values of the last row of the previous page, then its id. */
export type KeysetAfter = {
  readonly values: readonly (string | number)[];
  readonly id: string;
};

/** A sort column of a paged list. `time` marks a timestamp, which needs the id lookup above. */
export type KeyColumn = {
  readonly column: AnyColumn;
  readonly time?: true;
  /** The table column that holds the value when `column` is a derived one (a subquery's field). */
  readonly source?: AnyColumn;
};

export type KeysetOptions = {
  /** The table the id column belongs to (the lookup of a time key reads it). */
  readonly table: PgTable;
  readonly idColumn: AnyColumn;
  /** The id column of `table`, when `idColumn` is a derived one (a subquery's field). */
  readonly sourceIdColumn?: AnyColumn;
  /** The sort columns before the id, in order; their values are `after.values`, in order. */
  readonly keys: readonly KeyColumn[];
  readonly direction: "asc" | "desc";
  readonly after: KeysetAfter | undefined;
  /** The caller's scope (the Case, the entity): the id lookup stays inside it. */
  readonly scope: SQL | undefined;
};

function keyValue(
  key: KeyColumn,
  value: string | number | undefined,
  opts: KeysetOptions,
  id: string
): SQL {
  if (key.time !== true) return sql`${value}`;
  const scope = opts.scope === undefined ? sql`` : sql` and ${opts.scope}`;
  return sql`coalesce((select ${key.source ?? key.column} from ${opts.table} where ${opts.sourceIdColumn ?? opts.idColumn} = ${id}${scope}), ${value}::timestamptz)`;
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
    ...opts.keys.map((key, index) =>
      keyValue(key, after.values[index], opts, after.id)
    ),
    sql`${after.id}`,
  ];
  const operator = opts.direction === "asc" ? sql`>` : sql`<`;
  return sql`(${sql.join(columns, sql`, `)}) ${operator} (${sql.join(values, sql`, `)})`;
}
