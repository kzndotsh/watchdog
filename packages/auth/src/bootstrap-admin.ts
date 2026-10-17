import { hashPassword } from "better-auth/crypto";

import type { DbExec } from "@watchdog/db";
import {
  emailTaken,
  hasInstanceAdmin,
  insertInstanceAdmin,
  lockInstanceBootstrap,
} from "@watchdog/db";

export type BootstrapAdminInput = {
  readonly email: string;
  readonly name: string;
  readonly password: string;
};

export type BootstrapAdminResult =
  | { readonly status: "created"; readonly userId: string }
  | { readonly status: "admin-exists" }
  | { readonly status: "email-taken" };

/**
 * Create the first instance admin without opening public signup: a verified `admin` account
 * with an email-and-password credential, hashed the way Better Auth hashes it, so the normal
 * sign-in form accepts it. Refuses when any instance admin exists (the command is for a fresh
 * install; later admins are promoted in Settings, Users), and when the email is taken.
 *
 * The check and the insert share one transaction behind an advisory lock, so two concurrent
 * runs cannot both create an admin. The caller owns the connection (`db` in the command, a
 * transaction in tests).
 */
export async function bootstrapFirstAdmin(
  exec: DbExec,
  input: BootstrapAdminInput
): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await hashPassword(input.password);
  return exec.transaction(async (tx) => {
    await lockInstanceBootstrap(tx);
    if (await hasInstanceAdmin(tx)) return { status: "admin-exists" as const };
    if (await emailTaken(tx, email)) return { status: "email-taken" as const };
    const userId = crypto.randomUUID();
    await insertInstanceAdmin(tx, {
      id: userId,
      email,
      name: input.name.trim(),
      passwordHash,
    });
    return { status: "created" as const, userId };
  });
}
