import { count, eq } from "drizzle-orm";

import type { OrganizationId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { session, user } from "../schema/auth";

/**
 * The first account on an install becomes the instance admin (the operator who
 * enables/disables accounts). Later accounts are ordinary users; organizations
 * are created by users themselves (onboarding) or joined by invitation.
 * Returns whether this user was promoted.
 */
export async function promoteFirstUserToInstanceAdmin(
  exec: DbExec,
  userId: string
): Promise<boolean> {
  const [total] = await exec.select({ n: count() }).from(user).limit(1);
  if ((total?.n ?? 0) !== 1) return false;
  await exec
    .update(user)
    .set({ role: "admin", banned: false })
    .where(eq(user.id, userId));
  return true;
}

export async function setSessionActiveOrganization(
  exec: DbExec,
  sessionId: string,
  organizationId: OrganizationId
): Promise<void> {
  await exec
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.id, sessionId));
}
