import { member, organization, user, type DbExec } from "@watchdog/db";
import type { OrganizationId } from "@watchdog/schemas/shared";

/**
 * Make `userId` a member of `organizationId` with `role`, creating the user and
 * the organization when they are missing. `auth.*` survives `resetTestDb`, so it
 * is idempotent: a second call with another role changes the role.
 */
export async function seedOrganizationMember(
  exec: DbExec,
  values: { organizationId: OrganizationId; userId: string; role: string }
): Promise<void> {
  const now = new Date();
  await exec
    .insert(user)
    .values({
      id: values.userId,
      name: values.userId,
      email: `${values.userId}@example.test`,
      emailVerified: false,
    })
    .onConflictDoNothing();
  await exec
    .insert(organization)
    .values({
      id: values.organizationId,
      name: values.organizationId,
      slug: values.organizationId.toLowerCase(),
      createdAt: now,
    })
    .onConflictDoNothing();
  await exec
    .insert(member)
    .values({
      id: `${values.organizationId}:${values.userId}`,
      organizationId: values.organizationId,
      userId: values.userId,
      role: values.role,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: member.id,
      set: { role: values.role },
    });
}
