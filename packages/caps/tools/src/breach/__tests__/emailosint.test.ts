import { readFileSync } from "node:fs";
import path from "node:path";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { Effect } from "effect";

import { http, HttpResponse, mockServer } from "@watchdog/domain/test-kit/http";

import {
  RateLimitedError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  EMAILOSINT_MAX_ACCOUNTS,
  EMAILOSINT_MAX_BREACH_SOURCES,
  EMAILOSINT_MAX_SITES,
  EMAILOSINT_MAX_STEALER_HOSTS,
  fetchEmailosintLookupEffect,
  parseEmailosintBody,
} from "../emailosint";

const EMAIL = "alex.morgan@mailhost.test";
const AT = "2026-01-01T00:00:00.000Z";
const options = { userAgent: "watchdog-test" };
const signal = () => AbortSignal.timeout(5000);

const fixtureText = readFileSync(
  path.join(
    import.meta.dirname,
    "..",
    "__fixtures__",
    "emailosint-lookup.json"
  ),
  "utf-8"
);
const fixture: unknown = JSON.parse(fixtureText);

describe("parseEmailosintBody", () => {
  it("keeps the allowlisted account, site, breach and stealer fields", () => {
    const snap = parseEmailosintBody(EMAIL, AT, fixture);
    expect(snap.lookupId).toBe("65fa0b1c2c4a8e0d1c8b2a3f");
    expect(snap.completed).toBe(true);
    expect(snap.timedOut).toBe(false);
    expect(snap.accounts).toEqual([
      {
        service: "github",
        serviceName: "GitHub",
        domain: "github.com",
        category: "Developer",
        username: "alex",
        displayName: "Alex Morgan",
        profileUrl: "https://github.com/alex",
      },
      {
        service: "spotify",
        serviceName: "Spotify",
        domain: null,
        category: null,
        username: null,
        displayName: null,
        profileUrl: null,
      },
    ]);
    expect(snap.registeredOn).toEqual(["GitHub", "Adobe"]);
    expect(snap.notRegisteredCount).toBe(2);
    expect(snap.breachTotal).toBe(6);
    expect(snap.breachSourceCount).toBe(3);
    expect(snap.breachSources).toEqual([
      { name: "Adobe", date: "2013-10-04" },
      { name: "Canva", date: null },
    ]);
    expect(snap.stealerLogCount).toBe(2);
    expect(snap.stealerOriginHosts).toEqual(["login.shop.test"]);
    expect(snap.resultsRedacted).toBe(false);
    expect(snap.isTruncated).toBe(false);
  });

  it("names a service by its slug, not the opaque module id", () => {
    const snap = parseEmailosintBody(EMAIL, AT, {
      accounts: [
        { module: { id: "6abe1784436bf40124c43b1d", name: "gitlab" } },
      ],
    });
    expect(snap.accounts[0]?.service).toBe("gitlab");
  });

  it("reads the vendor's redacted flags", () => {
    const snap = parseEmailosintBody(EMAIL, AT, {
      data_breaches: { amount: 4, redacted: true },
    });
    expect(snap.resultsRedacted).toBe(true);
  });

  it("never copies a credential, phone, IP or AI text", () => {
    const stored = JSON.stringify(parseEmailosintBody(EMAIL, AT, fixture));
    for (const secret of [
      "hunter2",
      "5f4dcc3b5aa765d61d8327deb882cf99",
      "alexm",
      "192.0.2.10",
      "+15550100",
      "session=abc",
      "medium exposure",
    ]) {
      expect(stored).not.toContain(secret);
    }
  });

  it("cuts long account lists and flags the cut", () => {
    const row = { module: { id: "x" }, data: { fields: [] } };
    const snap = parseEmailosintBody(EMAIL, AT, {
      accounts: Array.from({ length: EMAILOSINT_MAX_ACCOUNTS + 5 }, () => row),
    });
    expect(snap.accounts).toHaveLength(EMAILOSINT_MAX_ACCOUNTS);
    expect(snap.isTruncated).toBe(true);
  });

  it("drops malformed values instead of failing the snapshot", () => {
    const long = "x".repeat(301);
    const snap = parseEmailosintBody(EMAIL, AT, {
      accounts: [
        {},
        {
          module: { name: long, id: "abc" },
          data: {
            fields: [
              { key: "username", value: long },
              {
                key: "profile_url",
                value: `https://h.test/${"p".repeat(2100)}`,
              },
              { key: "profile_url", value: "https://ignored.test/dup" },
            ],
          },
        },
        {
          module: { id: "noprofile" },
          data: { fields: [{ key: "profile_url", value: "not a url" }] },
        },
      ],
      validator: { registered: [{}, { name: "loom" }] },
      data_breaches: {
        amount: -1,
        sources: 2.5,
        results: [
          {},
          { source: {} },
          { source: { name: "Adobe", date: long } },
        ],
      },
      stealer_logs: {
        count: "3",
        results: [
          { origin: `https://${"a".repeat(250)}.${"b".repeat(60)}.test/` },
          { login: "x" },
        ],
      },
    });
    expect(
      snap.accounts.map((a) => [a.service, a.username, a.profileUrl])
    ).toEqual([
      ["abc", null, null],
      ["noprofile", null, null],
    ]);
    expect(snap.registeredOn).toEqual(["loom"]);
    expect(snap.breachTotal).toBeNull();
    expect(snap.breachSourceCount).toBeNull();
    expect(snap.breachSources).toEqual([{ name: "Adobe", date: null }]);
    expect(snap.stealerLogCount).toBe(3);
    expect(snap.stealerOriginHosts).toEqual([]);
  });

  it("cuts long site, breach and host lists and flags the cut", () => {
    const many = (n: number, make: (i: number) => unknown) =>
      Array.from({ length: n }, (_, i) => make(i));
    const snap = parseEmailosintBody(EMAIL, AT, {
      validator: {
        registered: many(EMAILOSINT_MAX_SITES + 1, (i) => ({ name: `s${i}` })),
      },
      data_breaches: {
        results: many(EMAILOSINT_MAX_BREACH_SOURCES + 1, (i) => ({
          source: { name: `b${i}` },
        })),
      },
      stealer_logs: {
        results: many(EMAILOSINT_MAX_STEALER_HOSTS + 1, (i) => ({
          origin: `https://h${i}.test/`,
        })),
      },
    });
    expect(snap.registeredOn).toHaveLength(EMAILOSINT_MAX_SITES);
    expect(snap.breachSources).toHaveLength(EMAILOSINT_MAX_BREACH_SOURCES);
    expect(snap.stealerOriginHosts).toHaveLength(EMAILOSINT_MAX_STEALER_HOSTS);
    expect(snap.isTruncated).toBe(true);
  });

  it("keeps a profile link as origin plus path only", () => {
    const urls = (value: string) =>
      parseEmailosintBody(EMAIL, AT, {
        accounts: [
          {
            module: { name: "github" },
            data: { fields: [{ key: "profile_url", value }] },
          },
        ],
      }).accounts[0]?.profileUrl;
    expect(urls("https://github.com/alex?session=abc#frag")).toBe(
      "https://github.com/alex"
    );
    expect(urls("https://alex:pw@github.com/alex")).toBeNull();
    expect(urls("https://alex@github.com/alex")).toBeNull();
    expect(urls(`https://h.test/${"é".repeat(400)}`)).toBeNull();
    expect(urls("https://github.com/alex")).toBe("https://github.com/alex");
  });

  it("refuses a body that is not an object", () => {
    expect(() => parseEmailosintBody(EMAIL, AT, [])).toThrow();
  });

  it("reads an empty body as no findings", () => {
    const snap = parseEmailosintBody(EMAIL, AT, {});
    expect(snap.accounts).toEqual([]);
    expect(snap.breachTotal).toBeNull();
    expect(snap.stealerLogCount).toBeNull();
    expect(snap.completed).toBe(false);
  });
});

const API = "https://api.emailosint.org/v1/lookup/email";

type Seen = { method: string; authorization: string | null; body: unknown }[];

/** Serve the lookup endpoint and record each request it receives. */
function serve(respond: () => Response): Seen {
  const seen: Seen = [];
  mockServer.use(
    http.all(API, async ({ request }) => {
      const text = await request.text();
      seen.push({
        method: request.method,
        authorization: request.headers.get("authorization"),
        body: text === "" ? null : (JSON.parse(text) as unknown),
      });
      return respond();
    })
  );
  return seen;
}

const lookup = (email: string) =>
  fetchEmailosintLookupEffect(email, "eo_test", signal(), options).pipe(
    Effect.provide(toolsHttpClientLayer)
  );

describe("fetchEmailosintLookupEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it.effect("posts the email with a bearer key and no AI summary", () =>
    Effect.gen(function* postsLookupGen() {
      const seen = serve(
        () =>
          new Response(fixtureText, {
            headers: { "content-type": "application/json" },
          })
      );
      const snap = yield* lookup(" Alex.Morgan@MailHost.test ");
      expect(snap.email).toBe(EMAIL);
      expect(seen).toEqual([
        {
          method: "POST",
          authorization: "Bearer eo_test",
          body: {
            email: EMAIL,
            module_timeout_ms: 15_000,
            disable_ai_summary: true,
          },
        },
      ]);
    })
  );

  it.effect("rejects an invalid email before any request", () =>
    Effect.gen(function* invalidEmailGen() {
      const seen = serve(
        () =>
          new Response(fixtureText, {
            headers: { "content-type": "application/json" },
          })
      );
      const failure = yield* lookup("not-an-email").pipe(Effect.flip);
      expect(failure).toBeInstanceOf(ValidationVendorError);
      expect(seen).toEqual([]);
    })
  );

  for (const [status, message] of [
    [401, "EmailOSINT API key invalid"],
    [402, "EmailOSINT API access needs a Business plan or higher"],
  ] as const) {
    it.effect(
      `HTTP ${status} is a fixed message with the status, not the email, in the cause`,
      () =>
        Effect.gen(function* refusedGen() {
          serve(() =>
            HttpResponse.json(
              { error: "x", message: `bad ${EMAIL}` },
              { status }
            )
          );
          const failure = yield* lookup(EMAIL).pipe(Effect.flip);
          expect(failure).toBeInstanceOf(ValidationVendorError);
          expect(failure.message).toBe(message);
          expect(String(failure.cause)).toContain(String(status));
          expect(String(failure.cause)).not.toContain(EMAIL);
        })
    );
  }

  it.effect("a quota 429 past the wait cap fails as RateLimitedError", () =>
    Effect.gen(function* quotaGen() {
      serve(() =>
        HttpResponse.json(
          { error: "plan_quota_reached" },
          { status: 429, headers: { "retry-after": "3600" } }
        )
      );
      const failure = yield* lookup(EMAIL).pipe(Effect.flip);
      expect(failure).toBeInstanceOf(RateLimitedError);
    })
  );
});
