import { asc } from "drizzle-orm";

import { db, graphHistory, type DbExec } from "@watchdog/db";

/** Every `graph_history` row in id order (the table is never read whole in production code). */
export async function listAllGraphHistory(
  exec: DbExec = db
): Promise<(typeof graphHistory.$inferSelect)[]> {
  return exec.select().from(graphHistory).orderBy(asc(graphHistory.id));
}
