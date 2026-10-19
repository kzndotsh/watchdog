import { asc } from "drizzle-orm";

import { activity, db, type ActivityRow, type DbExec } from "@watchdog/db";

/** Every `activity` row in id order, with the columns the wire shape leaves out (`actorKeyId`). */
export async function listAllActivity(
  exec: DbExec = db
): Promise<ActivityRow[]> {
  return exec.select().from(activity).orderBy(asc(activity.id));
}
