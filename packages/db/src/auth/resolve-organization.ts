import { and, eq } from "drizzle-orm";

import type { DbExec } from "../exec";
import { member } from "../schema/auth";

/**
 * Resolve the Better Auth organization for a user.
 *
 * If `preferredOrganizationId` is set, return it only when a membership
 * exists — never silently fall back to another org. If preferred is omitted
 * (API keys, sessions without an active org), return the oldest membership.
 */
export async function resolveUserOrganizationId(
  exec: DbExec,
  userId: string,
  preferredOrganizationId?: string | null
): Promise<string | null> {
  if (
    preferredOrganizationId !== undefined &&
    preferredOrganizationId !== null &&
    preferredOrganizationId !== ""
  ) {
    const [preferred] = await exec
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(
        and(
          eq(member.userId, userId),
          eq(member.organizationId, preferredOrganizationId)
        )
      )
      .limit(1);
    return preferred?.organizationId ?? null;
  }

  const [oldest] = await exec
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(member.createdAt)
    .limit(1);
  return oldest?.organizationId ?? null;
}
