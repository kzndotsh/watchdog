import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { Effect, Result } from "effect";

import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import {
  HttpVendorError,
  RateLimitedError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  classifyLeakradarQuery,
  fetchLeakradarLookupEffect,
  leakradarLookupSnapshotSchema,
  type LeakradarLookupSnapshot,
} from "../leakradar";

const API = /^https:\/\/api\.leakradar\.io\//;
const KEY = "lr-test-key-not-real";

type Seen = {
  method: string;
  path: string;
  params: URLSearchParams;
  authorization: string | null;
  body: unknown;
}[];

function serve(respond: (seen: Seen[number], n: number) => Response): Seen {
  const seen: Seen = [];
  mockServer.use(
    http.all(API, async ({ request }) => {
      const url = new URL(request.url);
      const text = request.method === "POST" ? await request.text() : "";
      const entry = {
        method: request.method,
        path: url.pathname,
        params: url.searchParams,
        authorization: request.headers.get("authorization"),
        body: text === "" ? null : (JSON.parse(text) as unknown),
      };
      seen.push(entry);
      return respond(entry, seen.length);
    })
  );
  return seen;
}

const signal = () => new AbortController().signal;
const lookup = (
  query: string,
  options: Parameters<typeof fetchLeakradarLookupEffect>[3] = {}
) =>
  fetchLeakradarLookupEffect(query, KEY, signal(), {
    userAgent: "watchdog-test",
    ...options,
  });

const HEADERS = (retryAfter: string, reason = "rate") => ({
  "retry-after": retryAfter,
  "x-lr-ratelimit-reason": reason,
});

const MASKED_ITEM = {
  id: null,
  url: "https://login.example.com/",
  username: null,
  username_masked: "a***@example.com",
  password: null,
  password_strength: null,
  unlocked: false,
  is_email: true,
  added_at: "2026-03-04T10:00:00Z",
  status: null,
};

const page = (
  items: unknown[],
  extra: Record<string, unknown> = {}
): Response =>
  HttpResponse.json({
    items,
    total: items.length,
    total_unlocked: 0,
    page: 1,
    page_size: 25,
    ...extra,
  });

const failure = <A, E>(outcome: Result.Result<A, E>): E => {
  if (!Result.isFailure(outcome)) throw new Error("expected a failure");
  return outcome.failure;
};

describe("fetchLeakradarLookupEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  describe("request shape", () => {
    it.effect("searches an email with a Bearer key and one bounded page", () =>
      Effect.gen(function* emailRequestGen() {
        const seen = serve(() => page([MASKED_ITEM]));
        yield* lookup("Alice@Example.com");
        expect(seen).toHaveLength(1);
        expect(seen[0]).toMatchObject({
          method: "POST",
          path: "/search/email",
          authorization: `Bearer ${KEY}`,
          body: { email: "alice@example.com", is_email: true },
        });
        expect(seen[0]?.params.get("page")).toBe("1");
        expect(seen[0]?.params.get("page_size")).toBe("25");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("searches a username with is_email false", () =>
      Effect.gen(function* usernameRequestGen() {
        const seen = serve(() => page([]));
        const named = yield* lookup("alice_99", { kind: "username" });
        const bare = yield* lookup("alice");
        expect(seen.map((s) => s.body)).toEqual([
          { email: "alice_99", is_email: false },
          { email: "alice", is_email: false },
        ]);
        expect(named.kind).toBe("username");
        expect(bare.kind).toBe("username");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("reads a domain summary with one GET and no listing", () =>
      Effect.gen(function* domainSummaryGen() {
        const seen = serve(() =>
          HttpResponse.json({
            employees_compromised: 3,
            third_parties_compromised: 5,
            customers_compromised: 7,
            counts_approximate: true,
            sampling_probability: 0.1,
          })
        );
        const snap = yield* lookup("Example.COM");
        expect(seen.map((s) => `${s.method} ${s.path}`)).toEqual([
          "GET /search/domain/example.com",
        ]);
        expect(seen[0]?.authorization).toBe(`Bearer ${KEY}`);
        expect(snap).toMatchObject({
          kind: "domain",
          found: true,
          total: 15,
          listed: false,
          isTruncated: false,
          records: [],
          domainCounts: {
            employees: 3,
            thirdParties: 5,
            customers: 7,
            approximate: true,
            samplingProbability: 0.1,
          },
        });
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("reads one masked listing page after the counts on request", () =>
      Effect.gen(function* domainListingGen() {
        const seen = serve((req) =>
          req.path.endsWith("/all")
            ? page([{ ...MASKED_ITEM, category: "employees" }], { total: 3 })
            : HttpResponse.json({
                employees_compromised: 1,
                third_parties_compromised: 1,
                customers_compromised: 1,
              })
        );
        const snap = yield* lookup("example.com", {
          includeRecords: true,
          pageSize: 10,
        });
        expect(seen.map((s) => s.path)).toEqual([
          "/search/domain/example.com",
          "/search/domain/example.com/all",
        ]);
        expect(seen[1]?.params.get("page_size")).toBe("10");
        expect(snap.listed).toBe(true);
        expect(snap.total).toBe(3);
        expect(snap.records[0]?.category).toBe("employees");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("skips the listing for a domain with no matches", () =>
      Effect.gen(function* emptyDomainGen() {
        const seen = serve(() =>
          HttpResponse.json({
            employees_compromised: 0,
            third_parties_compromised: 0,
            customers_compromised: 0,
          })
        );
        const snap = yield* lookup("example.com", { includeRecords: true });
        expect(seen).toHaveLength(1);
        expect(snap.found).toBe(false);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("refuses an IP address before any request", () =>
      Effect.gen(function* ipRefusedGen() {
        const seen = serve(() => page([]));
        const outcome = yield* Effect.result(lookup("203.0.113.7"));
        expect(failure(outcome)).toBeInstanceOf(ValidationVendorError);
        expect(seen).toHaveLength(0);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it("classifies by detection and by an explicit kind", () => {
      expect(classifyLeakradarQuery("a@example.com").kind).toBe("email");
      expect(classifyLeakradarQuery("example.com").kind).toBe("domain");
      expect(classifyLeakradarQuery("alice").kind).toBe("username");
      expect(classifyLeakradarQuery("alice", "username").value).toBe("alice");
      expect(() => classifyLeakradarQuery("alice", "email")).toThrow();
      expect(() => classifyLeakradarQuery("not a name", "username")).toThrow();
    });
  });

  describe("unlock is never called", () => {
    it.effect(
      "sends no unlock or export path and no auto_unlock, for every kind and page",
      () =>
        Effect.gen(function* neverUnlockGen() {
          const seen = serve((req) =>
            req.path.startsWith("/search/email") || req.path.endsWith("/all")
              ? page([MASKED_ITEM], { total: 500 })
              : HttpResponse.json({
                  employees_compromised: 1,
                  third_parties_compromised: 0,
                  customers_compromised: 0,
                })
          );
          yield* lookup("a@example.com", { page: 2 });
          yield* lookup("alice", { kind: "username" });
          yield* lookup("example.com");
          yield* lookup("example.com", { includeRecords: true, page: 3 });
          expect(seen.length).toBeGreaterThanOrEqual(5);
          for (const req of seen) {
            expect(req.path).not.toMatch(/unlock|export|password/i);
            expect(req.params.has("auto_unlock")).toBe(false);
            expect(JSON.stringify(req.body)).not.toMatch(/auto_unlock/);
            expect(req.path).toMatch(/^\/search\/(email|domain\/example\.com)/);
          }
        }).pipe(Effect.provide(toolsHttpClientLayer))
    );
  });

  describe("masked parsing", () => {
    it.effect("keeps masked metadata and reduces a URL to its host", () =>
      Effect.gen(function* maskedGen() {
        serve(() =>
          page(
            [
              MASKED_ITEM,
              {
                ...MASKED_ITEM,
                url: "https://user:secret@Shop.Example.com:8443/path?token=abc#frag",
                username_masked: "j***",
                is_email: false,
                unlocked: true,
              },
              {
                ...MASKED_ITEM,
                url: "android://c0ffee@com.example.app/",
                added_at: "not a date",
              },
              { ...MASKED_ITEM, url: "https://***/***", username_masked: null },
              { ...MASKED_ITEM, url: "ftp://files.example.org/x" },
              { ...MASKED_ITEM, url: null, added_at: null },
            ],
            { total: 6, total_unlocked: 1 }
          )
        );
        const snap = yield* lookup("a@example.com");
        expect(snap.totalUnlocked).toBe(1);
        expect(
          snap.records.map((r) => [r.host, r.sourceType, r.usernameMasked])
        ).toEqual([
          ["login.example.com", "web", "a***@example.com"],
          ["shop.example.com", "web", "j***"],
          ["com.example.app", "android_app", "a***@example.com"],
          ["***", "web", null],
          ["files.example.org", "other", "a***@example.com"],
          [null, null, "a***@example.com"],
        ]);
        expect(snap.records[0]).toMatchObject({
          isEmail: true,
          addedAt: "2026-03-04T10:00:00Z",
          unlocked: false,
        });
        expect(snap.records[1]?.unlocked).toBe(true);
        expect(snap.records[2]?.addedAt).toBeNull();
        expect(snap.records[5]?.addedAt).toBeNull();
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("reports no matches as found false", () =>
      Effect.gen(function* noMatchGen() {
        serve(() => page([], { total: 0 }));
        const snap = yield* lookup("a@example.com");
        expect(snap).toMatchObject({ found: false, total: 0, records: [] });
        expect(snap.isTruncated).toBe(false);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("fails when the response has no items", () =>
      Effect.gen(function* noItemsGen() {
        serve(() => HttpResponse.json({ total: 3 }));
        const outcome = yield* Effect.result(lookup("a@example.com"));
        expect(failure(outcome)._tag).toBe("ParseVendorError");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("fails when a domain report has no counts", () =>
      Effect.gen(function* noCountsGen() {
        serve(() => HttpResponse.json({ searched_by_count: 2 }));
        const outcome = yield* Effect.result(lookup("example.com"));
        expect(failure(outcome)._tag).toBe("ParseVendorError");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );
  });

  describe("credential allowlist", () => {
    const SECRETS = [
      "hunter2-not-real",
      "alice.plain@example.com",
      "leak-id-1234",
      "session=cookie-not-real",
      "tok-not-real",
      "Bearer-leak-not-real",
    ];
    const LEAKY_ITEM = {
      id: "leak-id-1234",
      url: "https://login.example.com/cb?token=tok-not-real&c=session=cookie-not-real",
      username: "alice.plain@example.com",
      username_masked: "a***@example.com",
      password: "hunter2-not-real",
      password_hash: "Bearer-leak-not-real",
      cookie: "session=cookie-not-real",
      token: "tok-not-real",
      password_strength: 9,
      unlocked: true,
      is_email: true,
      added_at: "2026-03-04T10:00:00Z",
      status: "new",
      category: "employees",
    };

    it.effect(
      "never lets a password or plaintext credential reach the snapshot",
      () =>
        Effect.gen(function* allowlistGen() {
          serve((req) =>
            req.path.endsWith("/all") || req.path === "/search/email"
              ? page([LEAKY_ITEM], { auto_unlock_points_consumed: 4 })
              : HttpResponse.json({
                  employees_compromised: 1,
                  third_parties_compromised: 0,
                  customers_compromised: 0,
                  blacklisted_value: "alice.plain@example.com",
                  employee_passwords: { total_pass: 1, strong: { qty: 1 } },
                })
          );
          const snaps = [
            yield* lookup("a@example.com"),
            yield* lookup("example.com", { includeRecords: true }),
          ];
          for (const snap of snaps) {
            const text = JSON.stringify(snap);
            for (const secret of SECRETS) expect(text).not.toContain(secret);
            for (const key of [
              "password",
              "cookie",
              "token",
              "hash",
              "strength",
            ]) {
              expect(text.toLowerCase()).not.toContain(key);
            }
          }
          expect(snaps[0]?.records[0]).toEqual({
            usernameMasked: "a***@example.com",
            host: "login.example.com",
            sourceType: "web",
            isEmail: true,
            addedAt: "2026-03-04T10:00:00Z",
            unlocked: true,
            category: "employees",
          });
        }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("drops a username field that is not masked", () =>
      Effect.gen(function* unmaskedGen() {
        serve(() =>
          page([{ ...MASKED_ITEM, username_masked: "alice.plain@example.com" }])
        );
        const snap = yield* lookup("a@example.com");
        expect(snap.records[0]?.usernameMasked).toBeNull();
        expect(JSON.stringify(snap)).not.toContain("alice.plain");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it("rejects a snapshot that carries a credential field", () => {
      const clean: LeakradarLookupSnapshot = {
        query: "a@example.com",
        kind: "email",
        queriedAt: "2026-01-01T00:00:00.000Z",
        source: "api.leakradar.io",
        found: true,
        total: 1,
        totalUnlocked: 0,
        domainCounts: null,
        page: 1,
        pageSize: 25,
        listed: true,
        isTruncated: false,
        records: [
          {
            usernameMasked: "a***@example.com",
            host: "login.example.com",
            sourceType: "web",
            isEmail: true,
            addedAt: null,
            unlocked: false,
            category: null,
          },
        ],
      };
      expect(leakradarLookupSnapshotSchema.safeParse(clean).success).toBe(true);
      const withPassword = {
        ...clean,
        records: [{ ...clean.records[0], password: "hunter2-not-real" }],
      };
      expect(
        leakradarLookupSnapshotSchema.safeParse(withPassword).success
      ).toBe(false);
      expect(
        leakradarLookupSnapshotSchema.safeParse({ ...clean, password: "x" })
          .success
      ).toBe(false);
    });
  });

  describe("pagination", () => {
    it.effect("flags a truncated page and clears it on the last", () =>
      Effect.gen(function* truncationGen() {
        serve(() => page([MASKED_ITEM, MASKED_ITEM], { total: 5 }));
        const first = yield* lookup("a@example.com", { pageSize: 2 });
        const last = yield* lookup("a@example.com", { pageSize: 2, page: 3 });
        const exact = yield* lookup("a@example.com", { pageSize: 5 });
        expect(first.isTruncated).toBe(true);
        expect(last.isTruncated).toBe(false);
        expect(exact.isTruncated).toBe(false);
        expect(first.total).toBe(5);
        expect(first.records).toHaveLength(2);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("never reads more than the bounded page and size", () =>
      Effect.gen(function* boundsGen() {
        const seen = serve(() =>
          page(
            Array.from({ length: 150 }, () => MASKED_ITEM),
            { total: 150 }
          )
        );
        const snap = yield* lookup("a@example.com", {
          page: 99,
          pageSize: 1000,
        });
        expect(seen[0]?.params.get("page")).toBe("10");
        expect(seen[0]?.params.get("page_size")).toBe("100");
        expect(snap.records).toHaveLength(100);
        yield* lookup("a@example.com", { page: 0, pageSize: 0 });
        expect(seen[1]?.params.get("page")).toBe("1");
        expect(seen[1]?.params.get("page_size")).toBe("1");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );
  });

  describe("errors", () => {
    const PLAN = "LeakRadar plan or account does not allow this search";
    it.effect.each([
      { status: 401, message: "LeakRadar rejected the API key" },
      { status: 402, message: PLAN },
      { status: 403, message: PLAN },
    ])(
      "maps $status to a fixed credential or plan error",
      ({ status, message }) =>
        Effect.gen(function* statusGen() {
          serve(() =>
            HttpResponse.json({ detail: "echo a@example.com" }, { status })
          );
          const error = failure(yield* Effect.result(lookup("a@example.com")));
          expect(error).toBeInstanceOf(ValidationVendorError);
          expect(error.message).toBe(message);
          expect(error.message).not.toContain("example.com");
        }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("maps 503 to an unavailable HTTP failure", () =>
      Effect.gen(function* maintenanceGen() {
        serve(() =>
          HttpResponse.json(
            { detail: "maintenance", code: "search_unavailable" },
            { status: 503 }
          )
        );
        const error = failure(yield* Effect.result(lookup("example.com")));
        expect(error).toBeInstanceOf(HttpVendorError);
        expect(error).toMatchObject({ status: 503 });
        expect(error.message).toMatch(/unavailable/);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect.each([400, 422])(
      "keeps %s as an HTTP failure, not input",
      (status) =>
        Effect.gen(function* businessGen() {
          serve(() => HttpResponse.json({ detail: "bad page" }, { status }));
          const error = failure(yield* Effect.result(lookup("a@example.com")));
          expect(error).toBeInstanceOf(HttpVendorError);
          expect(error).toMatchObject({ status });
        }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect(
      "retries a 429 once after a short Retry-After, then succeeds",
      () =>
        Effect.gen(function* retryOnceGen() {
          const seen = serve((_req, n) =>
            n === 1
              ? new HttpResponse("slow down", {
                  status: 429,
                  headers: HEADERS("0"),
                })
              : page([MASKED_ITEM])
          );
          const snap = yield* lookup("a@example.com");
          expect(seen).toHaveLength(2);
          expect(snap.records).toHaveLength(1);
        }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("fails a second 429 as rate limited after one retry", () =>
      Effect.gen(function* persistentGen() {
        const seen = serve(
          () =>
            new HttpResponse("slow down", {
              status: 429,
              headers: HEADERS("0"),
            })
        );
        const error = failure(yield* Effect.result(lookup("a@example.com")));
        expect(error).toBeInstanceOf(RateLimitedError);
        expect(seen).toHaveLength(2);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("does not wait out a long Retry-After inside the Job", () =>
      Effect.gen(function* longGen() {
        const seen = serve(
          () =>
            new HttpResponse("quota", {
              status: 429,
              headers: HEADERS("7200", "daily_quota"),
            })
        );
        const started = Date.now();
        const error = failure(yield* Effect.result(lookup("a@example.com")));
        expect(Date.now() - started).toBeLessThan(2000);
        expect(seen).toHaveLength(1);
        expect(error).toBeInstanceOf(RateLimitedError);
        expect(error).toMatchObject({ retryAfterMs: 7_200_000 });
        expect(error.message).not.toContain("example.com");
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );

    it.effect("treats a Retry-After just over the limit as too long", () =>
      Effect.gen(function* boundaryGen() {
        const seen = serve(
          () =>
            new HttpResponse("slow", {
              status: 429,
              headers: HEADERS("6"),
            })
        );
        const error = failure(yield* Effect.result(lookup("a@example.com")));
        expect(error).toBeInstanceOf(RateLimitedError);
        expect(seen).toHaveLength(1);
      }).pipe(Effect.provide(toolsHttpClientLayer))
    );
  });
});
