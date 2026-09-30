import { db, resolveUserOrganizationId } from "@watchdog/db";

/** The organization a user acts in: their preferred (session) one, else their membership. */
export async function resolveActorOrganizationId(
  userId: string,
  preferredOrganizationId?: string | null
): Promise<string | null> {
  return resolveUserOrganizationId(db, userId, preferredOrganizationId);
}
