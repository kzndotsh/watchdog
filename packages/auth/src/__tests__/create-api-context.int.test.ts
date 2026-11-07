import { afterEach, describe, expect, it } from "vitest";

import { account, client, db, member, organization, user } from "@watchdog/db";
import { asOrganizationId } from "@watchdog/schemas/shared";
import { testHttpOrigin } from "@watchdog/test-kit";

import { createApiContext } from "../api-context";
import { createAuth } from "../create-auth";
import { createScopedApiKey } from "../scoped-api-key";

/**
 * Who is calling, end to end on the test database: a real Better Auth instance, real
 * membership and ban reads. Only the HTTP request is built by the test.
 */
const auth = createAuth({ db });
const PASSWORD = "correct horse battery staple";
const EMAIL_DOMAIN = "api-context.test";
const SLUG_PREFIX = "api-context-";
const URL_OF_REQUEST = testHttpOrigin("127.0.0.1", "/api/v1/health");

async function seedOrganization() {
  const organizationId = asOrganizationId(crypto.randomUUID());
  await db.insert(organization).values({
    id: organizationId,
    name: "Seeded Org",
    slug: `${SLUG_PREFIX}${organizationId}`,
    createdAt: new Date(),
  });
  return organizationId;
}

async function seedMember(extraOrganizations = 0) {
  const ctx = await auth.$context;
  const id = crypto.randomUUID();
  const email = `${id}@${EMAIL_DOMAIN}`;
  await db.insert(user).values({
    id,
    email,
    name: "Analyst",
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
  const organizationIds = await Promise.all(
    Array.from({ length: extraOrganizations + 1 }, async (_, n) => {
      const organizationId = await seedOrganization();
      await db.insert(member).values({
        id: crypto.randomUUID(),
        organizationId,
        userId: id,
        role: "member",
        createdAt: new Date(Date.now() + n),
      });
      return organizationId;
    })
  );
  return { id, email, organizationIds };
}

async function newKey(
  owner: Awaited<ReturnType<typeof seedMember>>,
  scopes: Parameters<typeof createScopedApiKey>[1]["scopes"] = ["cases:read"],
  organizationId = owner.organizationIds[0] ?? null
) {
  const created = await createScopedApiKey(auth, {
    userId: owner.id,
    organizationId,
    name: "agent",
    scopes,
  });
  return created;
}

function bearer(key: string) {
  return new Request(URL_OF_REQUEST, {
    headers: { authorization: `Bearer ${key}` },
  });
}

function contextFor(request: Request) {
  return createApiContext(auth, request, db);
}

async function setKeyColumn(
  keyId: string,
  column: "metadata" | "permissions",
  value: string | null
) {
  await (column === "metadata"
    ? client`update auth.apikey set metadata = ${value} where id = ${keyId}`
    : client`update auth.apikey set permissions = ${value} where id = ${keyId}`);
}

afterEach(async () => {
  await client`delete from auth."user" where email like ${`%@${EMAIL_DOMAIN}`}`;
  await client`delete from auth.organization where slug like ${`${SLUG_PREFIX}%`}`;
});

describe("createApiContext", () => {
  it("returns no caller for a request with no credentials", async () => {
    const context = await contextFor(new Request(URL_OF_REQUEST));

    expect(context.actor).toBeNull();
    expect(context.credential).toBeUndefined();
  });

  it("returns no caller for an API key that does not exist", async () => {
    const context = await contextFor(bearer("wd_not_a_real_key"));

    expect(context.actor).toBeNull();
    expect(context.credential).toBeUndefined();
  });

  it("returns a session-backed caller in the user's organization", async () => {
    const owner = await seedMember();
    const { headers } = await auth.api.signInEmail({
      body: { email: owner.email, password: PASSWORD },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");

    const context = await contextFor(
      new Request(URL_OF_REQUEST, { headers: { cookie } })
    );

    expect(context.credential).toEqual({ kind: "session" });
    expect(context.actor).toEqual({
      userId: owner.id,
      email: owner.email,
      name: "Analyst",
      organizationId: owner.organizationIds[0],
    });
  });

  it.each(["bearer", "x-api-key"] as const)(
    "scopes an API key (%s) to the organization in its metadata, not the owner's oldest",
    async (header) => {
      const owner = await seedMember(1);
      const [, second] = owner.organizationIds;
      const created = await newKey(owner, ["cases:read"], second);

      const context = await contextFor(
        header === "bearer"
          ? bearer(created.key)
          : new Request(URL_OF_REQUEST, {
              headers: { "x-api-key": created.key },
            })
      );

      expect(context.actor).toEqual({
        userId: owner.id,
        email: null,
        name: "api-key:agent",
        organizationId: second,
      });
      expect(context.credential).toEqual({
        kind: "apiKey",
        keyId: created.id,
        scopes: new Set(["cases:read"]),
      });
    }
  );

  it("refuses a scoped key whose owner left that organization", async () => {
    const owner = await seedMember();
    const created = await newKey(owner);
    await client`delete from auth.member where user_id = ${owner.id}`;

    const context = await contextFor(bearer(created.key));

    expect(context.actor).toBeNull();
    expect(context.credential).toBeUndefined();
  });

  it.each([
    ["null", null],
    ["an empty object", "{}"],
    ["a blank string", "  "],
    ["no organizationId", '{"other":"x"}'],
    ["an empty organizationId", '{"organizationId":""}'],
    ["unparseable text", "{broken"],
  ])(
    "refuses a key whose metadata names no organization (%s), with no oldest-organization fallback",
    async (_label, metadata) => {
      const owner = await seedMember();
      const created = await newKey(owner);
      await setKeyColumn(created.id, "metadata", metadata);

      const context = await contextFor(bearer(created.key));

      expect(context.actor).toBeNull();
      expect(context.credential).toBeUndefined();
    }
  );

  describe("a key whose owner is banned", () => {
    it("is refused: no actor, no credential", async () => {
      const owner = await seedMember();
      const created = await newKey(owner);
      await client`update auth."user" set banned = true where id = ${owner.id}`;

      const context = await contextFor(bearer(created.key));

      expect(context.actor).toBeNull();
      expect(context.credential).toBeUndefined();
    });

    it("is let through once the ban has expired", async () => {
      const owner = await seedMember();
      const created = await newKey(owner);
      await client`update auth."user" set banned = true, ban_expires = now() - interval '1 day' where id = ${owner.id}`;

      const context = await contextFor(bearer(created.key));

      expect(context.actor?.userId).toBe(owner.id);
      expect(context.credential).toMatchObject({ kind: "apiKey" });
    });
  });

  describe("key scopes", () => {
    it("parses stored permissions onto the credential, a write scope implying read", async () => {
      const owner = await seedMember();
      const created = await newKey(owner, ["evidence:write"]);

      const context = await contextFor(bearer(created.key));

      expect(context.credential).toEqual({
        kind: "apiKey",
        keyId: created.id,
        scopes: new Set(["cases:read", "evidence:write"]),
      });
    });

    it.each([
      ["no stored scopes", null],
      ["an empty object", "{}"],
      ["a blank string", ""],
      ["an empty scope list", '{"cases":[]}'],
      ["unreadable text", "{broken"],
      ["an unknown resource", '{"admin":["write"]}'],
      ["a number", "7"],
    ])(
      "refuses a key with %s, with no read-only fallback",
      async (_l, stored) => {
        const owner = await seedMember();
        const created = await newKey(owner);
        await setKeyColumn(created.id, "permissions", stored);

        const context = await contextFor(bearer(created.key));

        expect(context.actor).toBeNull();
        expect(context.credential).toBeUndefined();
      }
    );
  });
});
