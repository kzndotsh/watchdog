import { count, eq, like, sql } from "drizzle-orm";

import type { OrganizationId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { account, session, user } from "../schema/auth";

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

/** Serialises first-admin bootstrap runs ("WDADMIN" as bytes) for the length of a transaction. */
const BOOTSTRAP_LOCK_KEY = 0x57_44_41_44_4d_49_4en;

/** Take the bootstrap advisory lock until `exec`'s transaction ends. */
export async function lockInstanceBootstrap(exec: DbExec): Promise<void> {
  await exec.execute(
    sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY.toString()}::bigint)`
  );
}

/**
 * Whether any account holds the instance admin role. `auth.user.role` is a comma-separated
 * list (`admin` among others), so the `like` only narrows the rows and the exact check is here.
 */
export async function hasInstanceAdmin(exec: DbExec): Promise<boolean> {
  const rows = await exec
    .select({ role: user.role })
    .from(user)
    .where(like(user.role, "%admin%"));
  return rows.some((row) =>
    (row.role ?? "").split(",").some((part) => part.trim() === "admin")
  );
}

export async function emailTaken(
  exec: DbExec,
  email: string
): Promise<boolean> {
  const rows = await exec
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  return rows.length > 0;
}

/**
 * Insert an instance admin and its email-and-password credential, the rows Better Auth's own
 * sign-up writes (`providerId` `credential`, `accountId` the user id, `issuer` by default).
 * The password arrives already hashed: hashing is Better Auth's, in `@watchdog/auth`.
 */
export async function insertInstanceAdmin(
  exec: DbExec,
  input: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly passwordHash: string;
  }
): Promise<void> {
  await exec.insert(user).values({
    id: input.id,
    email: input.email,
    name: input.name,
    emailVerified: true,
    role: "admin",
    banned: false,
  });
  await exec.insert(account).values({
    id: crypto.randomUUID(),
    userId: input.id,
    accountId: input.id,
    providerId: "credential",
    password: input.passwordHash,
  });
}
