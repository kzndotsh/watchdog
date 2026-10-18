import { asc } from "drizzle-orm";

import {
  db,
  graphHistory,
  type DbExec,
  type GraphHistoryRow,
} from "@watchdog/db";

/** Every `graph_history` row in id order (the table is never read whole in production code). */
export async function listAllGraphHistory(
  exec: DbExec = db
): Promise<GraphHistoryRow[]> {
  return exec.select().from(graphHistory).orderBy(asc(graphHistory.id));
}
