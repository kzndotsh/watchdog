import { asc } from "drizzle-orm";

import { activity, type ActivityRow, type DbExec } from "#db";

import { ownerDb } from "./with-test-tx.ts";

/**
 * Every `activity` row in id order, with the columns the wire shape leaves out (`actorKeyId`): of
 * every organization by default (read as the owner, past row-level security), or of `exec`'s scope.
 */
export async function listAllActivity(
  exec: DbExec = ownerDb()
): Promise<ActivityRow[]> {
  return exec.select().from(activity).orderBy(asc(activity.id));
}
