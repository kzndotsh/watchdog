import { describe, expect, it, vi } from "vitest";

import { client, db, user } from "@watchdog/db";

// The env module reads the process environment once, when it is first imported (CI turns
// signup on for other suites), so a closed install is set before any import below
// (`unstubEnvs` restores it after each test).
vi.hoisted(() => {
  vi.stubEnv("BETTER_AUTH_ALLOW_SIGNUP", "0");
});

import { bootstrapFirstAdmin } from "../bootstrap-admin";
import { createAuth } from "../create-auth";

const auth = createAuth({ db });
const PASSWORD = "first admin pass phrase";
const ROLLBACK = new Error("rollback");

/**
 * Run `body` inside a transaction that always rolls back, so the shared test database keeps
 * whatever instance admins other suites left behind. Demoting them inside the transaction
 * gives each case the fresh install it needs.
 */
async function onFreshInstall(
  body: (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0]
  ) => Promise<void>
): Promise<void> {
  await db
    .transaction(async (tx) => {
      await tx.update(user).set({ role: "user" });
      await body(tx);
      throw ROLLBACK;
    })
    .catch((error: unknown) => {
      if (error !== ROLLBACK) throw error;
    });
}

describe("bootstrapFirstAdmin", () => {
  it("creates an instance admin who can sign in, without enabling signup", async () => {
    // Commits (sign-in reads through the shared pool, not this transaction) and cleans up.
    const email = `bootstrap-${crypto.randomUUID()}@bootstrap-admin.test`;
    // Integration files run one at a time; other suites' admins are demoted for this case and
    // restored in `finally`.
    const demoted =
      await client`select id, role from auth."user" where role like '%admin%'`;
    try {
      await client`update auth."user" set role = 'user' where role like '%admin%'`;
      const result = await bootstrapFirstAdmin(db, {
        email: email.toUpperCase(),
        name: "First Admin",
        password: PASSWORD,
      });
      expect(result.status).toBe("created");

      const [row] =
        await client`select role, email_verified, banned, email from auth."user" where email = ${email}`;
      expect(row).toMatchObject({
        role: "admin",
        email_verified: true,
        banned: false,
        email,
      });

      const signedIn = await auth.api.signInEmail({
        body: { email, password: PASSWORD },
      });
      expect(signedIn.user.email).toBe(email);
      await expect(
        auth.api.signInEmail({ body: { email, password: "wrong password!!" } })
      ).rejects.toThrow();

      // Sign-up stays closed: the flag is off and the endpoint refuses.
      await expect(
        auth.api.signUpEmail({
          body: {
            email: `other-${email}`,
            password: PASSWORD,
            name: "Other",
          },
        })
      ).rejects.toThrow();
    } finally {
      await client`delete from auth."user" where email like ${`%@bootstrap-admin.test`}`;
      await Promise.all(
        demoted.map(
          (row) =>
            client`update auth."user" set role = ${row.role as string} where id = ${row.id as string}`
        )
      );
    }
  });

  it("refuses when an instance admin already exists", async () => {
    await onFreshInstall(async (tx) => {
      const first = await bootstrapFirstAdmin(tx, {
        email: "first@bootstrap-admin.test",
        name: "First",
        password: PASSWORD,
      });
      expect(first.status).toBe("created");

      const second = await bootstrapFirstAdmin(tx, {
        email: "second@bootstrap-admin.test",
        name: "Second",
        password: PASSWORD,
      });
      expect(second).toEqual({ status: "admin-exists" });
      const rows = await tx.select({ email: user.email }).from(user);
      expect(rows.map((r) => r.email)).not.toContain(
        "second@bootstrap-admin.test"
      );
    });
  });

  it("refuses an email that already has an account when no admin exists", async () => {
    await onFreshInstall(async (tx) => {
      await tx.insert(user).values({
        id: crypto.randomUUID(),
        email: "taken@bootstrap-admin.test",
        name: "Taken",
        emailVerified: true,
        role: "user",
      });
      const result = await bootstrapFirstAdmin(tx, {
        email: "Taken@Bootstrap-Admin.test",
        name: "Late",
        password: PASSWORD,
      });
      expect(result).toEqual({ status: "email-taken" });
    });
  });

  it("does not treat a role that merely contains admin as the instance admin", async () => {
    await onFreshInstall(async (tx) => {
      await tx.insert(user).values({
        id: crypto.randomUUID(),
        email: "sysadmin@bootstrap-admin.test",
        name: "Sysadmin",
        emailVerified: true,
        role: "sysadmin",
      });
      const result = await bootstrapFirstAdmin(tx, {
        email: "real@bootstrap-admin.test",
        name: "Real",
        password: PASSWORD,
      });
      expect(result.status).toBe("created");
    });
  });
});
