import { APIError } from "better-auth/api";
import { afterEach, describe, expect, it } from "vitest";

import { account, client, db, member, organization, user } from "@watchdog/db";
import { asOrganizationId } from "@watchdog/schemas/shared";

import { createAuth } from "../create-auth";

/**
 * The behaviour `createAuth` promises, through a real instance on the test database:
 * who may create or delete an organization, where a new session starts, what a disabled
 * account sees. The session cookie cache and its bypass list are covered by
 * `session-cookie-cache.int.test.ts`; the invitation flow by `invite-signup.int.test.ts`.
 * The env here has `BETTER_AUTH_ALLOW_SIGNUP` unset (closed); the open case is
 * `create-auth-open-signup.int.test.ts`.
 */
const auth = createAuth();
const PASSWORD = "correct horse battery staple";
const EMAIL_DOMAIN = "create-auth.test";
const SLUG_PREFIX = "create-auth-";

async function seedUser(opts: { role?: string; orgRole?: string } = {}) {
  const ctx = await auth.$context;
  const id = crypto.randomUUID();
  const email = `${id}@${EMAIL_DOMAIN}`;
  await db.insert(user).values({
    id,
    email,
    name: "Seeded",
    emailVerified: true,
    role: opts.role ?? "user",
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    providerId: "credential",
    accountId: id,
    password: await ctx.password.hash(PASSWORD),
  });
  let organizationId = null;
  if (opts.orgRole) {
    organizationId = asOrganizationId(crypto.randomUUID());
    await db.insert(organization).values({
      id: organizationId,
      name: "Seeded Org",
      slug: `${SLUG_PREFIX}${organizationId}`,
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: id,
      role: opts.orgRole,
      createdAt: new Date(),
    });
  }
  return { id, email, organizationId };
}

async function signIn(instance: typeof auth, email: string) {
  const { headers } = await instance.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  const cookie = headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}

async function failureOf(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return {
      status: error instanceof APIError ? error.status : null,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  return null;
}

async function organizationExists(id: string) {
  const rows = await client`select id from auth.organization where id = ${id}`;
  return rows.length === 1;
}

afterEach(async () => {
  await client`delete from auth."user" where email like ${`%@${EMAIL_DOMAIN}`}`;
  await client`delete from auth.organization where slug like ${`${SLUG_PREFIX}%`}`;
});

describe("createAuth organization creation on an invite-only install", () => {
  it("refuses a plain user and creates nothing", async () => {
    const plain = await seedUser();
    const headers = await signIn(auth, plain.email);
    const slug = `${SLUG_PREFIX}plain-${crypto.randomUUID()}`;

    const failure = await failureOf(async () =>
      auth.api.createOrganization({ headers, body: { name: "Mine", slug } })
    );

    expect(failure?.status).toBe("FORBIDDEN");
    const rows =
      await client`select id from auth.organization where slug = ${slug}`;
    expect(rows).toEqual([]);
  });

  it("lets the instance admin create one and become its owner", async () => {
    const admin = await seedUser({ role: "admin" });
    const headers = await signIn(auth, admin.email);
    const slug = `${SLUG_PREFIX}admin-${crypto.randomUUID()}`;

    const created = await auth.api.createOrganization({
      headers,
      body: { name: "Admin Org", slug },
    });

    const rows =
      await client`select role from auth.member where organization_id = ${created.id} and user_id = ${admin.id}`;
    expect(rows).toEqual([{ role: "owner" }]);
  });
});

describe("createAuth session start", () => {
  it("starts a session in the user's organization, in the very first cookie and on the stored row", async () => {
    const member = await seedUser({ orgRole: "member" });

    const headers = await signIn(auth, member.email);

    // The cookie handed out at sign-in already names the organization: no request has to
    // wait for the cache to turn over (60 s) to see it.
    expect(
      (await auth.api.getSession({ headers }))?.session.activeOrganizationId
    ).toBe(member.organizationId);
    const rows =
      await client`select active_organization_id from auth.session where user_id = ${member.id}`;
    expect(rows).toEqual([{ active_organization_id: member.organizationId }]);
  });

  it("starts a session with no active organization for a user in none", async () => {
    const loner = await seedUser();

    const headers = await signIn(auth, loner.email);

    const rows =
      await client`select active_organization_id from auth.session where user_id = ${loner.id}`;
    expect(rows).toEqual([{ active_organization_id: null }]);
    expect(
      (await auth.api.getSession({ headers }))?.session.activeOrganizationId
    ).toBeNull();
  });
});

describe("createAuth organization deletion", () => {
  it("is refused when no cleanup hook is given, and the organization stays", async () => {
    const owner = await seedUser({ orgRole: "owner" });
    const headers = await signIn(auth, owner.email);

    const failure = await failureOf(async () =>
      auth.api.deleteOrganization({
        headers,
        body: { organizationId: owner.organizationId ?? "" },
      })
    );

    expect(failure).not.toBeNull();
    expect(await organizationExists(owner.organizationId ?? "")).toBe(true);
  });

  it("runs the cleanup hook with the organization and actor before deleting", async () => {
    const owner = await seedUser({ orgRole: "owner" });
    const seen: {
      organizationId: string;
      actorId: string;
      existed: boolean;
    }[] = [];
    const withHook = createAuth({
      beforeDeleteOrganization: async (input) => {
        seen.push({
          ...input,
          existed: await organizationExists(input.organizationId),
        });
      },
    });
    const headers = await signIn(withHook, owner.email);

    await withHook.api.deleteOrganization({
      headers,
      body: { organizationId: owner.organizationId ?? "" },
    });

    // The hook saw the organization still present, then it was removed.
    expect(seen).toEqual([
      {
        organizationId: owner.organizationId,
        actorId: owner.id,
        existed: true,
      },
    ]);
    expect(await organizationExists(owner.organizationId ?? "")).toBe(false);
  });

  it("keeps the organization when the cleanup hook throws", async () => {
    const owner = await seedUser({ orgRole: "owner" });
    const withHook = createAuth({
      beforeDeleteOrganization: async () => {
        throw new Error("cases could not be removed");
      },
    });
    const headers = await signIn(withHook, owner.email);

    const failure = await failureOf(async () =>
      withHook.api.deleteOrganization({
        headers,
        body: { organizationId: owner.organizationId ?? "" },
      })
    );

    expect(failure).not.toBeNull();
    expect(await organizationExists(owner.organizationId ?? "")).toBe(true);
  });
});

describe("createAuth disabled accounts", () => {
  it("refuses sign-in with the disabled-account message", async () => {
    const target = await seedUser();
    await client`update auth."user" set banned = true, ban_reason = 'disabled' where id = ${target.id}`;

    const failure = await failureOf(async () =>
      auth.api.signInEmail({
        body: { email: target.email, password: PASSWORD },
      })
    );

    expect(failure?.message).toBe("This account is disabled.");
  });
});

describe("createAuth trailing plugins", () => {
  it("are appended after every built-in plugin", async () => {
    const withTrailing = createAuth({
      trailingPlugins: [{ id: "framework-cookies" }],
    });
    const ids = (await withTrailing.$context).options.plugins?.map(
      (plugin) => plugin.id
    );
    expect(ids?.at(-1)).toBe("framework-cookies");
    expect(ids).toContain("invite-signup");
    expect(ids).toContain("organization");
  });
});
