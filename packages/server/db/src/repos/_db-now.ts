import { sql } from "drizzle-orm";

/**
 * The database clock as a value for a `set` clause, so a refreshed timestamp comes from the same
 * clock as a column's `DEFAULT now()`. Raw `sql` lives here, outside `*.repo.ts`, like
 * `_keyset.ts`.
 */
export const dbNow = sql`now()`;
