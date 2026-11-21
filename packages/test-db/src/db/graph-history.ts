import { asc } from "drizzle-orm";

import { graphHistory, type DbExec } from "@watchdog/db";

import { ownerDb } from "./with-test-tx.ts";

/**
 * Every `graph_history` row in id order (the table is never read whole in production code): of
 * every organization by default (read as the owner, past row-level security), or of `exec`'s scope.
 */
export async function listAllGraphHistory(
  exec: DbExec = ownerDb()
): Promise<(typeof graphHistory.$inferSelect)[]> {
  return exec.select().from(graphHistory).orderBy(asc(graphHistory.id));
}
