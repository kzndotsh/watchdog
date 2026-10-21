import { afterEach, describe, expect, it, vi } from "vitest";

import { account, client, db, user } from "@watchdog/db";

// The env module reads the process environment once, when it is first imported, so the
// switch is set before any import below (`unstubEnvs` restores it after each test).
vi.hoisted(() => {
  vi.stubEnv("BETTER_AUTH_ALLOW_SIGNUP", "1");
});

import { createAuth } from "../create-auth";

const auth = createAuth({ db });
const PASSWORD = "correct horse battery staple";
const EMAIL_DOMAIN = "create-auth-open.test";

afterEach(async () => {
  await client`delete from auth."user" where email like ${`%@${EMAIL_DOMAIN}`}`;
  await client`delete from auth.organization where slug like 'create-auth-open-%'`;
});

describe("createAuth organization creation on an open-signup install", () => {
  it("lets a plain user create an organization and become its owner", async () => {
    const ctx = await auth.$context;
    const id = crypto.randomUUID();
    const email = `${id}@${EMAIL_DOMAIN}`;
    await db.insert(user).values({
      id,
      email,
      name: "Open",
      emailVerified: true,
      role: "user",
    });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      userId: id,
      providerId: "credential",
      accountId: id,
      password: await ctx.password.hash(PASSWORD),
    });
    const { headers } = await auth.api.signInEmail({
      body: { email, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");

    const created = await auth.api.createOrganization({
      headers: new Headers({ cookie }),
      body: {
        name: "Open Org",
        slug: `create-auth-open-${crypto.randomUUID()}`,
      },
    });

    const rows =
      await client`select role from auth.member where organization_id = ${created.id} and user_id = ${id}`;
    expect(rows).toEqual([{ role: "owner" }]);
  });
});
