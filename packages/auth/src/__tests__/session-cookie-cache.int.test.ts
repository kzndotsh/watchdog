import { afterEach, describe, expect, it, vi } from "vitest";

import { account, client, db, member, organization, user } from "@watchdog/db";
import {
  asOrganizationId,
  type OrganizationId,
} from "@watchdog/schemas/shared";
import { captureStatements, expectQueries } from "@watchdog/test-db";

import { resolveActorOrganizationId } from "../actor";
import { createAuth } from "../create-auth";
import {
  dropChunkedSessionCache,
  SESSION_COOKIE_CACHE_SECONDS,
} from "../session-cache";

const auth = createAuth();
const PASSWORD = "correct horse battery staple";

/** The cookie header a browser would send back after a response set these cookies. */
function cookieHeader(
  setCookies: readonly string[],
  jar = new Map<string, string>()
): Headers {
  for (const line of setCookies) {
    const pair = line.split(";")[0] ?? "";
    const eq = pair.indexOf("=");
    const name = pair.slice(0, eq);
    if (/;\s*max-age=0/i.test(line)) jar.delete(name);
    else jar.set(name, pair.slice(eq + 1));
  }
  return new Headers({
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
  });
}

const created: string[] = [];

async function seedUser(opts?: { role?: string; withOrg?: boolean }) {
  const ctx = await auth.$context;
  const id = crypto.randomUUID();
  const email = `${id}@session-cache.test`;
  await db.insert(user).values({
    id,
    email,
    name: "Ada Lovelace",
    emailVerified: true,
    image: "https://cdn.example.test/avatars/ada-lovelace.png",
    role: opts?.role ?? "user",
  });
  await db.insert(account).values({
    id: crypto.randomUUID(),
    userId: id,
    providerId: "credential",
    accountId: id,
    password: await ctx.password.hash(PASSWORD),
  });
  created.push(id);
  let organizationId: OrganizationId | null = null;
  if (opts?.withOrg) {
    organizationId = asOrganizationId(crypto.randomUUID());
    await db.insert(organization).values({
      id: organizationId,
      name: "Org",
      slug: `org-${organizationId}`,
      createdAt: new Date(),
    });
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: id,
      role: "owner",
      createdAt: new Date(),
    });
  }
  return { id, email, organizationId };
}

async function signIn(email: string) {
  const { headers } = await auth.api.signInEmail({
    body: { email, password: PASSWORD },
    returnHeaders: true,
  });
  return headers.getSetCookie();
}

afterEach(async () => {
  vi.useRealTimers();
  const ids = created.splice(0);
  if (ids.length > 0) {
    await client`delete from auth."user" where id in ${client(ids)}`;
  }
});

describe("session cookie cache", () => {
  it("is 60 seconds and never refreshes without a database read", async () => {
    const options = (await auth.$context).options.session?.cookieCache;
    expect(options?.enabled).toBe(true);
    expect(options?.maxAge).toBe(60);
    expect(SESSION_COOKIE_CACHE_SECONDS).toBe(60);
    // `refreshCache` would extend the cache without re-reading the session row:
    // the revocation window would no longer be bounded by maxAge.
    expect(options?.refreshCache).toBe(false);
  });

  it("serves the second and third authenticated calls without a session query", async () => {
    const { email, id } = await seedUser({ withOrg: true });
    const cookies = await signIn(email);
    const headers = cookieHeader(cookies);

    const first = await expectQueries(0, async () =>
      auth.api.getSession({ headers })
    );
    expect(first?.user.id).toBe(id);
    await expectQueries(0, async () => auth.api.getSession({ headers }));
    await expectQueries(0, async () => auth.api.getSession({ headers }));
  });

  it("budgets a whole authenticated server-function call: getSession plus the membership check", async () => {
    // What `requireAuth` does before every server function (apps/web/src/auth/middleware.ts).
    async function authenticatedCall(headers: Headers) {
      const current = await auth.api.getSession({ headers });
      return resolveActorOrganizationId(
        current!.user.id,
        current!.session.activeOrganizationId
      );
    }
    const { email, organizationId } = await seedUser({ withOrg: true });
    const cookies = await signIn(email);
    const cached = cookieHeader(cookies);
    const tokenOnly = cookieHeader(
      cookies.filter((line) => line.includes("session_token"))
    );

    // Before the cache: session row + user row + membership = 3 statements per call.
    expect(
      await expectQueries(3, async () => authenticatedCall(tokenOnly))
    ).toBe(organizationId);
    // With the cache: only the membership check, which is never cached (a removed
    // member must lose the organization on the next request).
    expect(await expectQueries(1, async () => authenticatedCall(cached))).toBe(
      organizationId
    );
    expect(await expectQueries(1, async () => authenticatedCall(cached))).toBe(
      organizationId
    );
    expect(await expectQueries(1, async () => authenticatedCall(cached))).toBe(
      organizationId
    );
  });

  it("reads the session row once per call when no cached cookie is sent", async () => {
    const { email, id } = await seedUser({ withOrg: true });
    const cookies = await signIn(email);
    const uncached = new Headers({
      cookie: cookieHeader(
        cookies.filter((line) => line.includes("session_token"))
      ).get("cookie")!,
    });

    const { result, statements } = await captureStatements(async () =>
      auth.api.getSession({ headers: uncached })
    );
    expect(result?.user.id).toBe(id);
    // Documented number: the session row by token, then its user by id.
    expect(statements.map((s) => s.sql)).toEqual([
      expect.stringMatching(/from "auth"\."session"/i),
      expect.stringMatching(/from "auth"\."user"/i),
    ]);
  });

  it("carries the active organization in the cached session", async () => {
    const { email, organizationId } = await seedUser({ withOrg: true });
    const cookies = await signIn(email);
    const fromCache = await auth.api.getSession({
      headers: cookieHeader(cookies),
    });
    expect(fromCache?.session.activeOrganizationId).toBe(organizationId);
  });

  it("stays well under the 4 KB browser cookie limit with realistic user fields", async () => {
    const { email } = await seedUser({ role: "admin", withOrg: true });
    const cookies = await signIn(email);
    const sessionData = cookies.filter((line) => line.includes("session_data"));
    expect(sessionData.length).toBeGreaterThan(0);
    for (const line of cookies) {
      // name=value plus attributes is what counts against the per-cookie limit.
      expect(line.length).toBeLessThan(4096);
    }
    const total = sessionData.reduce((sum, line) => sum + line.length, 0);
    expect(total).toBeLessThan(2048);
  });

  it("still checks membership on every call: a removed member loses the organization at once", async () => {
    const { email, organizationId } = await seedUser({ withOrg: true });
    const headers = cookieHeader(await signIn(email));
    const cached = await auth.api.getSession({ headers });
    const userId = cached!.user.id;
    expect(await resolveActorOrganizationId(userId, organizationId)).toBe(
      organizationId
    );

    await client`delete from auth.member where user_id = ${userId}`;

    // The cookie cache is untouched (still names the organization) ...
    const stillCached = await auth.api.getSession({ headers });
    expect(stillCached?.session.activeOrganizationId).toBe(organizationId);
    // ... but membership is read from the database, not from the cookie.
    expect(
      await resolveActorOrganizationId(
        userId,
        stillCached?.session.activeOrganizationId
      )
    ).toBeNull();
  });

  it("stops serving a revoked session once the cache lifetime has passed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { email, id } = await seedUser({ withOrg: true });
    const headers = cookieHeader(await signIn(email));
    await client`delete from auth.session where user_id = ${id}`;

    // Inside the window the signed cookie still authenticates: the documented tradeoff.
    expect((await auth.api.getSession({ headers }))?.user.id).toBe(id);

    vi.setSystemTime(Date.now() + (SESSION_COOKIE_CACHE_SECONDS + 1) * 1000);
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("reads the database when the caller opts out of the cache", async () => {
    const { email, id } = await seedUser({ withOrg: true });
    const headers = cookieHeader(await signIn(email));
    await client`delete from auth.session where user_id = ${id}`;

    expect(
      await auth.api.getSession({
        headers,
        query: { disableCookieCache: true },
      })
    ).toBeNull();
  });
});

describe("a session too large for one cookie", () => {
  // An inline `data:` avatar (the profile editor's fallback when no upload backend exists).
  const hugeImage = `data:image/png;base64,${"A".repeat(60_000)}`;

  it("is not cached: no session_data cookie is sent and each call reads the database", async () => {
    const { email, id } = await seedUser({ withOrg: true });
    await client`update auth."user" set image = ${hugeImage} where id = ${id}`;
    const cookies = await signIn(email);

    const headers = cookieHeader(cookies);
    // Any cache chunk was written as an expiry, so the browser keeps none.
    expect(headers.get("cookie")).not.toContain("session_data");
    expect(headers.get("cookie")!.length).toBeLessThan(1024);

    const { result, statements } = await captureStatements(async () =>
      auth.api.getSession({ headers })
    );
    expect(result?.user.image).toBe(hugeImage);
    // The session row, then its user: the same as a call with no cache at all.
    expect(statements).toHaveLength(2);
  });

  it("expires a smaller cache cookie the browser already holds", async () => {
    const { email, id } = await seedUser({ withOrg: true });
    const jar = new Map<string, string>();
    const headers = cookieHeader(await signIn(email), jar);
    expect(headers.get("cookie")).toContain("session_data");

    const { headers: responseHeaders } = await auth.api.updateUser({
      headers,
      body: { image: hugeImage },
      returnHeaders: true,
    });
    const after = cookieHeader(responseHeaders.getSetCookie(), jar);
    expect(after.get("cookie")).not.toContain("session_data");
    expect(after.get("cookie")).toContain("session_token");
    expect((await auth.api.getSession({ headers: after }))?.user.id).toBe(id);
  });
});

describe("dropChunkedSessionCache", () => {
  const base = "better-auth.session_data";
  it("leaves a single-cookie cache alone", () => {
    expect(
      dropChunkedSessionCache([`${base}=abc; Path=/; HttpOnly`], base)
    ).toBeNull();
  });
  it("replaces every chunk with an expiry and keeps other cookies", () => {
    const out = dropChunkedSessionCache(
      [
        "better-auth.session_token=t; Path=/; HttpOnly",
        `${base}.0=a; Max-Age=60; Path=/; HttpOnly`,
        `${base}.1=b; Max-Age=60; Path=/; HttpOnly`,
      ],
      base
    );
    expect(out).toEqual([
      "better-auth.session_token=t; Path=/; HttpOnly",
      `${base}=; Path=/; HttpOnly; Max-Age=0`,
      `${base}.0=; Path=/; HttpOnly; Max-Age=0`,
      `${base}.1=; Path=/; HttpOnly; Max-Age=0`,
    ]);
  });
});

describe("an organization change refreshes the cached session", () => {
  it("makes a just-created organization the active one on the very next request", async () => {
    // Better Auth writes `activeOrganizationId` to the session row here but leaves the
    // signed cookie alone, so without the after hook the cache would still say "no
    // organization" for up to 60 s (onboarding would look unfinished).
    const { email } = await seedUser({ role: "admin" });
    const jar = new Map<string, string>();
    const headers = cookieHeader(await signIn(email), jar);
    expect(
      (await auth.api.getSession({ headers }))?.session.activeOrganizationId
    ).toBeNull();

    const slug = `sc-${crypto.randomUUID()}`;
    const { headers: responseHeaders, response } =
      await auth.api.createOrganization({
        headers,
        body: { name: "Fresh Org", slug },
        returnHeaders: true,
      });
    const next = cookieHeader(responseHeaders.getSetCookie(), jar);

    expect(
      (await auth.api.getSession({ headers: next }))?.session
        .activeOrganizationId
    ).toBe(response.id);
    await client`delete from auth.organization where slug = ${slug}`;
  });
});

describe("admin and membership actions bypass the cookie cache", () => {
  it("rejects a demoted instance admin's cached cookie on ban-user", async () => {
    const admin = await seedUser({ role: "admin" });
    const target = await seedUser();
    const headers = cookieHeader(await signIn(admin.email));
    // The cached session still says role=admin.
    expect((await auth.api.getSession({ headers }))?.user.role).toBe("admin");

    await client`update auth."user" set role = 'user' where id = ${admin.id}`;

    await expect(
      auth.api.banUser({ headers, body: { userId: target.id } })
    ).rejects.toThrow();
    const [row] =
      await client`select banned from auth."user" where id = ${target.id}`;
    expect(row?.banned).not.toBe(true);
  });

  it("rejects a revoked session on an admin read", async () => {
    const admin = await seedUser({ role: "admin" });
    const headers = cookieHeader(await signIn(admin.email));
    await client`delete from auth.session where user_id = ${admin.id}`;

    await expect(auth.api.listUsers({ headers, query: {} })).rejects.toThrow();
  });

  it("lets a current instance admin through", async () => {
    const admin = await seedUser({ role: "admin" });
    const target = await seedUser();
    const headers = cookieHeader(await signIn(admin.email));

    await auth.api.banUser({ headers, body: { userId: target.id } });
    const [row] =
      await client`select banned from auth."user" where id = ${target.id}`;
    expect(row?.banned).toBe(true);
  });

  it("rejects remove-member from a session whose user was deleted", async () => {
    const owner = await seedUser({ withOrg: true });
    const other = await seedUser();
    const organizationId = asOrganizationId(owner.organizationId!);
    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: other.id,
      role: "member",
      createdAt: new Date(),
    });
    const headers = cookieHeader(await signIn(owner.email));
    await client`delete from auth.session where user_id = ${owner.id}`;

    await expect(
      auth.api.removeMember({
        headers,
        body: { memberIdOrEmail: other.email, organizationId },
      })
    ).rejects.toThrow();
  });
});
