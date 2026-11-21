import { eq } from "drizzle-orm";

import type { DbExec } from "../exec";
import { user } from "../schema/auth";

/**
 * Whether a user is banned right now: `banned` is set and the ban has no expiry or has not
 * expired yet (Better Auth's admin plugin lifts an expired ban on the next sign-in; an API key
 * never signs in, so the expiry is honoured here). An unknown user is not banned.
 */
export async function isUserBanned(
  exec: DbExec,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  const [row] = await exec
    .select({ banned: user.banned, banExpires: user.banExpires })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (row?.banned !== true) return false;
  return row.banExpires === null || row.banExpires.getTime() > now.getTime();
}
