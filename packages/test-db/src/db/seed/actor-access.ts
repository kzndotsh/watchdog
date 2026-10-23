import { and, eq } from "drizzle-orm";

import { apiKey, member, user, type DbExec } from "@watchdog/db";
import type { OrganizationId } from "@watchdog/schemas/shared";

/**
 * Lift any ban on `userId` and delete API key `keyId`: `auth.*` survives `resetTestDb`, so a
 * test that changes a user's access starts from this (and `seedOrganizationMember`).
 */
export async function resetActorAccess(
  exec: DbExec,
  values: { userId: string; keyId: string }
): Promise<void> {
  await exec
    .update(user)
    .set({ banned: false, banExpires: null })
    .where(eq(user.id, values.userId));
  await exec.delete(apiKey).where(eq(apiKey.id, values.keyId));
}

/** Remove `userId` from `organizationId` (the user leaves, or is removed). */
export async function removeOrganizationMember(
  exec: DbExec,
  values: { organizationId: OrganizationId; userId: string }
): Promise<void> {
  await exec
    .delete(member)
    .where(
      and(
        eq(member.organizationId, values.organizationId),
        eq(member.userId, values.userId)
      )
    );
}

/** Ban `userId`; without `banExpires` the ban has no end. */
export async function banUser(
  exec: DbExec,
  userId: string,
  banExpires: Date | null = null
): Promise<void> {
  await exec
    .update(user)
    .set({ banned: true, banExpires })
    .where(eq(user.id, userId));
}

/** An API key row (Better Auth `apikey`) issued to `ownerId`; fields override the defaults. */
export async function seedApiKey(
  exec: DbExec,
  values: { id: string; ownerId: string } & Partial<
    Pick<typeof apiKey.$inferInsert, "enabled" | "expiresAt" | "metadata">
  >
): Promise<void> {
  const now = new Date();
  await exec.insert(apiKey).values({
    id: values.id,
    referenceId: values.ownerId,
    key: "hashed-secret",
    enabled: values.enabled,
    expiresAt: values.expiresAt,
    metadata: values.metadata,
    createdAt: now,
    updatedAt: now,
  });
}

/** Change an API key's `enabled` flag or expiry. */
export async function updateApiKey(
  exec: DbExec,
  id: string,
  patch: Partial<Pick<typeof apiKey.$inferInsert, "enabled" | "expiresAt">>
): Promise<void> {
  await exec.update(apiKey).set(patch).where(eq(apiKey.id, id));
}

/** Delete an API key (the owner revokes it). */
export async function deleteApiKey(exec: DbExec, id: string): Promise<void> {
  await exec.delete(apiKey).where(eq(apiKey.id, id));
}

/** Set a user's Better Auth role (`auth.user.role`): `admin` makes them an instance admin. */
export async function setUserRole(
  exec: DbExec,
  userId: string,
  role: string | null
): Promise<void> {
  await exec.update(user).set({ role }).where(eq(user.id, userId));
}
