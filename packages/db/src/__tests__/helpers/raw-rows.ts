import { SQL, sql } from "drizzle-orm";

import type { DbTx } from "../../exec";

/** A row as plain column-name keys; a `sql` fragment value is inlined (jsonb literals, casts). */
export type RawRow = Record<string, unknown>;

/**
 * Insert a row by column name, bypassing the repos and their types. The invariant tests need
 * rows the repos would refuse (a value outside the vocabulary, a link across Cases), so the
 * statement that Postgres must refuse is written out by hand.
 */
export async function insertRawRow(
  tx: DbTx,
  table: string,
  row: RawRow,
  schema = "public"
): Promise<void> {
  const columns = Object.keys(row).map((column) => sql.identifier(column));
  const values = Object.values(row).map((value) =>
    value instanceof SQL ? value : sql`${value}`
  );
  await tx.execute(
    sql`insert into ${sql.identifier(schema)}.${sql.identifier(table)} (${sql.join(columns, sql`, `)}) values (${sql.join(values, sql`, `)})`
  );
}
