import {
  isUserBanned,
  resolveUserOrganizationId,
  type DbExec,
} from "@watchdog/db";
import {
  type OrganizationId,
  organizationIdSchema,
} from "@watchdog/schemas/shared";

/**
 * The organization a user acts in: their preferred (session or API-key) one, else
 * their membership. This is the single place an organization id is minted: the
 * preferred id is parsed here (blank counts as absent), and the resolved id is
 * read from a typed database column. `db` is the process pool, injected by the
 * caller (the pool has one owner, `Db.owned`; see ADR-0002).
 */
export async function resolveActorOrganizationId(
  db: DbExec,
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

/** Whether the user is banned right now (an expired ban does not count). */
export async function isActorBanned(
  db: DbExec,
  userId: string
): Promise<boolean> {
  return isUserBanned(db, userId);
}
