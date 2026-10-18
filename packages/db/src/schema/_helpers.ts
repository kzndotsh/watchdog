import { customType, text, timestamp } from "drizzle-orm/pg-core";

export function timestamptz(name: string) {
  return timestamp(name, { withTimezone: true });
}

export const createdAt = timestamptz("created_at").notNull().defaultNow();

/** App-layer auto-touch on UPDATE (not a DB trigger). */
const updatedAt = timestamptz("updated_at")
  .notNull()
  .defaultNow()
  .$onUpdateFn(() => new Date());

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
 * Postgres `xid8` (a 64-bit transaction id). The driver returns it as decimal text, which is how
 * the activity cursor carries it (it can exceed 2^53).
 */
export const xid8 = customType<{ data: string; driverData: string }>({
  dataType() {
    return "xid8";
  },
});
