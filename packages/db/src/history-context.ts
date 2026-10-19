import { sql } from "drizzle-orm";

import type { GraphHistoryChannel } from "@watchdog/schemas/shared";

import type { DbExec } from "./exec";

/** Who is writing the Graph in this transaction, and through which door. */
export type GraphHistoryContext = {
  /** The user. Absent for a write with no caller (the row then has no author). */
  actorId?: string | null;
  /** API-key display snapshot (`api-key:...`). */
  actorLabel?: string | null;
  /** The API key (`apikey.id`) when a key made the change; absent for a session or a system write. */
  actorKeyId?: string | null;
  channel: GraphHistoryChannel;
};

/**
 * Tell the Graph triggers who is writing: four transaction-local settings
 * (`watchdog.actor_id`, `watchdog.actor_label`, `watchdog.actor_key_id`, `watchdog.channel`) that the
 * `graph_history_row` and `graph_attribution` triggers read. Call it once, as
 * the first statement of a Graph write transaction, on that transaction's `tx`:
 * the settings end with it. The application role may not write the Graph without
 * them (the database refuses with `HISTORY_CONTEXT_MISSING_SQLSTATE` (`@watchdog/schemas/shared`)); the owner role
 * may, and is recorded as channel `system`, no actor. Not a repo (it opens no transaction and writes no table), so it may use
 * a raw statement.
 */
export async function setGraphHistoryContext(
  exec: DbExec,
  context: GraphHistoryContext
): Promise<void> {
  await exec.execute(sql`select
    set_config('watchdog.actor_id', ${context.actorId ?? ""}, true),
    set_config('watchdog.actor_label', ${context.actorLabel ?? ""}, true),
    set_config('watchdog.actor_key_id', ${context.actorKeyId ?? ""}, true),
    set_config('watchdog.channel', ${context.channel}, true)`);
}
