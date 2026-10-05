import { db, resolveUserOrganizationId } from "@watchdog/db";
import {
  type OrganizationId,
  organizationIdSchema,
} from "@watchdog/schemas/shared";

/**
 * The organization a user acts in: their preferred (session or API-key) one, else
 * their membership. This is the single place an organization id is minted: the
 * preferred id is parsed here (blank counts as absent), and the resolved id is
 * read from a typed database column.
 */
export async function resolveActorOrganizationId(
  userId: string,
  preferredOrganizationId?: string | null
): Promise<OrganizationId | null> {
  const preferred = organizationIdSchema.safeParse(preferredOrganizationId);
  return resolveUserOrganizationId(
    db,
    userId,
    preferred.success ? preferred.data : null
  );
}
