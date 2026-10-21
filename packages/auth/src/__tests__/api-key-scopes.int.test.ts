import { afterEach, describe, expect, it } from "vitest";

import { account, client, db, member, organization, user } from "@watchdog/db";
import { asOrganizationId, parseKeyScopes } from "@watchdog/schemas/shared";

import {
  API_KEY_CREATE_REFUSED,
  API_KEY_UPDATE_REFUSED,
} from "../api-key-guard";
import { createAuth } from "../create-auth";
import { createScopedApiKey } from "../scoped-api-key";

/**
 * Key creation end to end on the test database: the server call sets scopes and organization,
 * the browser path to Better Auth's endpoints cannot.
 */
const auth = createAuth({ db });
const PASSWORD = "correct horse battery staple";
const EMAIL_DOMAIN = "api-key-scopes.test";
const SLUG_PREFIX = "api-key-scopes-";
const ORIGIN = "http://127.0.0.1:3000";

async function seedMember() {
  const ctx = await auth.$context;
  const id = crypto.randomUUID();
  const email = `${id}@${EMAIL_DOMAIN}`;
  await db.insert(user).values({
    id,
    email,
    name: "Seeded",
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
  const organizationId = asOrganizationId(crypto.randomUUID());
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
    role: "member",
    createdAt: new Date(),
  });
  return { id, email, organizationId };
}

async function signInCookie(email: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return headers
    .getSetCookie()
    .map((line) => line.split(";")[0])
    .join("; ");
}

/** A browser-style call: a real HTTP request to the Better Auth handler, with the session cookie. */
function browserPost(path: string, cookie: string, body: unknown) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { cookie, origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  );
}

async function keyRows(userId: string) {
  return client`select id, name, permissions, metadata from auth.apikey where reference_id = ${userId}`;
}

afterEach(async () => {
  await client`delete from auth."user" where email like ${`%@${EMAIL_DOMAIN}`}`;
  await client`delete from auth.organization where slug like ${`${SLUG_PREFIX}%`}`;
});

describe("createScopedApiKey", () => {
  it("stores exactly the normalised scopes and the given organization, and the key verifies with them", async () => {
    const owner = await seedMember();

    const created = await createScopedApiKey(auth, {
      userId: owner.id,
      organizationId: owner.organizationId,
      name: "agent",
      scopes: ["proposals:write"],
    });

    expect(created.key).toMatch(/^wd_/);
    const [row] = await keyRows(owner.id);
    expect(row?.id).toBe(created.id);
    expect(JSON.parse(String(row?.permissions))).toEqual({
      cases: ["read"],
      proposals: ["write"],
    });
    expect(JSON.parse(String(row?.metadata))).toEqual({
      organizationId: owner.organizationId,
    });
    const verified = await auth.api.verifyApiKey({
      body: { key: created.key },
    });
    expect(verified.valid).toBe(true);
    expect(parseKeyScopes(verified.key?.permissions)).toEqual({
      ok: true,
      scopes: new Set(["cases:read", "proposals:write"]),
    });
  });

  it("gives a full key all four scopes", async () => {
    const owner = await seedMember();

    await createScopedApiKey(auth, {
      userId: owner.id,
      organizationId: owner.organizationId,
      scopes: [
        "cases:read",
        "evidence:write",
        "proposals:write",
        "graph:write",
      ],
    });

    const [row] = await keyRows(owner.id);
    expect(JSON.parse(String(row?.permissions))).toEqual({
      cases: ["read"],
      evidence: ["write"],
      proposals: ["write"],
      graph: ["write"],
    });
  });
});

describe("createScopedApiKey without an organization", () => {
  it("refuses and creates no key", async () => {
    const owner = await seedMember();

    await expect(
      createScopedApiKey(auth, {
        userId: owner.id,
        organizationId: null,
        scopes: ["cases:read"],
      })
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await keyRows(owner.id)).toEqual([]);
  });
});

describe("the browser path", () => {
  it("refuses a client request to create a key, with or without scopes", async () => {
    const owner = await seedMember();
    const cookie = await signInCookie(owner.email);

    const bodies = [
      { name: "plain" },
      {
        name: "sneaky",
        metadata: { organizationId: owner.organizationId },
      },
      { name: "scoped", permissions: { graph: ["write"] } },
    ];
    const responses = await Promise.all(
      bodies.map(async (body) => browserPost("/api-key/create", cookie, body))
    );
    expect(responses.map((response) => response.status)).toEqual([
      403, 403, 403,
    ]);
    const messages = await Promise.all(
      responses.map(async (response) => response.json())
    );
    for (const message of messages) {
      expect(message).toMatchObject({ message: API_KEY_CREATE_REFUSED });
    }
    expect(await keyRows(owner.id)).toEqual([]);
  });

  it("refuses a headers-bearing in-process create as a client call", async () => {
    const owner = await seedMember();
    const cookie = await signInCookie(owner.email);

    await expect(
      auth.api.createApiKey({
        headers: new Headers({ cookie }),
        body: { name: "x" },
      })
    ).rejects.toMatchObject({ status: "FORBIDDEN" });
    expect(await keyRows(owner.id)).toEqual([]);
  });

  it("lets a client rename a key but not change its metadata or permissions", async () => {
    const owner = await seedMember();
    const cookie = await signInCookie(owner.email);
    const created = await createScopedApiKey(auth, {
      userId: owner.id,
      organizationId: owner.organizationId,
      name: "before",
      scopes: ["cases:read"],
    });

    const renamed = await browserPost("/api-key/update", cookie, {
      keyId: created.id,
      name: "after",
    });
    expect(renamed.status).toBe(200);

    const changes = [
      { metadata: { organizationId: crypto.randomUUID() } },
      { permissions: { graph: ["write"] } },
    ];
    const refused = await Promise.all(
      changes.map(async (change) =>
        browserPost("/api-key/update", cookie, { keyId: created.id, ...change })
      )
    );
    expect(refused.map((response) => response.status)).toEqual([403, 403]);
    const refusals = await Promise.all(
      refused.map(async (response) => response.json())
    );
    for (const refusal of refusals) {
      expect(refusal).toMatchObject({ message: API_KEY_UPDATE_REFUSED });
    }
    const [row] = await keyRows(owner.id);
    expect(row?.name).toBe("after");
    expect(JSON.parse(String(row?.permissions))).toEqual({ cases: ["read"] });
    expect(JSON.parse(String(row?.metadata))).toEqual({
      organizationId: owner.organizationId,
    });
  });
});
