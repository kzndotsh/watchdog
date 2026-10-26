import { sql } from "drizzle-orm";
import type { AnyColumn, SQL } from "drizzle-orm";

/**
 * `column = ANY($1::text[])`: membership in a list bound as ONE array parameter. `inArray` binds
 * each value as its own parameter, so a list from caller data (every Identifier value of a page
 * of Proposals) can pass Postgres's 65,535 bind-parameter limit; this never does. A btree on
 * the column serves it like `IN (...)`.
 */
export function textInAny(column: AnyColumn, values: readonly string[]): SQL {
  return sql`${column} = ANY(${sql.param([...values])}::text[])`;
}
