import { customType, integer, text, timestamp } from "drizzle-orm/pg-core";

export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true });
}

export const createdAt = timestamptz("created_at").notNull().defaultNow();

/**
 * Postgres owns the touch: the BEFORE UPDATE trigger `touch_updated_at` (`0016_touch_updated_at`)
 * sets it to `now()` on every table with this column, so no repo, raw statement or migration can
 * leave it stale. Never set it in `.set()`.
 */
const updatedAt = timestamptz("updated_at").notNull().defaultNow();

export const timestamps = {
  createdAt,
  updatedAt,
};

/**
 * Who created and last changed a Graph row (a Better Auth user id as text, no
 * FK: a removed user must neither cascade nor block, and the id stays readable
 * in `graph_history`). NULL means no recorded author: a row that predates
 * attribution with no activity entry naming its author, or a system write.
 * An API key's write records the key's user here; the key snapshot lives in
 * `graph_history.actor_label`.
 */
export const attribution = {
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
};

/**
 * Optimistic-concurrency token of a Graph row (#307): 1 on insert, +1 on every UPDATE. The BEFORE
 * UPDATE trigger `graph_version_bump` (`0001_database_logic`) owns the increment, so no
 * write path (a repo, a cascade, a seed, a hand-written statement, the Evidence-link touch) can
 * skip it and a repo never sets it. A caller's update names the version it read and the repo adds
 * `AND version = $n` to the UPDATE's WHERE.
 */
export const rowVersion = {
  version: integer("version").notNull().default(1),
};

/**
 * Postgres `xid8` (a 64-bit transaction id). The driver returns it as decimal text, which is how
 * the activity cursor carries it (it can exceed 2^53).
 */
export const xid8 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "xid8";
  },
});
