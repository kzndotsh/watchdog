import { count, eq } from "drizzle-orm";

import type { DbExec } from "../exec";
import { member, organization, session, user } from "../schema/auth";

export const WATCHDOG_ORGANIZATION_NAME = "Watchdog";
export const WATCHDOG_ORGANIZATION_SLUG = "watchdog";

export interface BootstrapOrganizationResult {
  organizationId: string | null;
  created: boolean;
}

async function membershipOrgId(
  exec: DbExec,
  userId: string
): Promise<string | null> {
  const [row] = await exec
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .limit(1);
  return row?.organizationId ?? null;
}

async function insertWatchdogOrg(
  exec: DbExec,
  userId: string
): Promise<string> {
  const organizationId = crypto.randomUUID();
  const now = new Date();
  await exec.insert(organization).values({
    id: organizationId,
    name: WATCHDOG_ORGANIZATION_NAME,
    slug: WATCHDOG_ORGANIZATION_SLUG,
    createdAt: now,
  });
  await exec.insert(member).values({
    id: crypto.randomUUID(),
    organizationId,
    userId,
    role: "owner",
    createdAt: now,
  });
  await exec
    .update(user)
    .set({ role: "admin", banned: false })
    .where(eq(user.id, userId));
  return organizationId;
}

/**
 * Create the single install organization on first user, or return an existing
 * membership. Does not add later users to an org that already exists.
 */
export async function bootstrapWatchdogOrganization(
  exec: DbExec,
  userId: string
): Promise<BootstrapOrganizationResult> {
  const existingMembership = await membershipOrgId(exec, userId);
  if (existingMembership) {
    return { organizationId: existingMembership, created: false };
  }

  const [orgCount] = await exec
    .select({ n: count() })
    .from(organization)
    .limit(1);
  if ((orgCount?.n ?? 0) > 0) {
    return { organizationId: null, created: false };
  }

  try {
    const organizationId = await insertWatchdogOrg(exec, userId);
    return { organizationId, created: true };
  } catch {
    const [existing] = await exec
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.slug, WATCHDOG_ORGANIZATION_SLUG))
      .limit(1);
    return { organizationId: existing?.id ?? null, created: false };
  }
}

export async function setSessionActiveOrganization(
  exec: DbExec,
  sessionId: string,
  organizationId: string
): Promise<void> {
  await exec
    .update(session)
    .set({ activeOrganizationId: organizationId })
    .where(eq(session.id, sessionId));
}
