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

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchViewDnsReverseHostEffect,
  fetchViewDnsReverseWhoisEffect,
  type ViewDnsReverseHostVia,
} from "../viewdns";

const KEY = "vd-secret-key";
const BASE = "https://api.viewdns.info";
const DEMO_MARKER = "demonstration---tool-for-paid-users-only";

function reverseHost(via: ViewDnsReverseHostVia, host = "NS1.Example.net.") {
  return fetchViewDnsReverseHostEffect(
    host,
    via,
    KEY,
    AbortSignal.timeout(5000),
    { userAgent: "watchdog-test" }
  ).pipe(Effect.provide(toolsHttpClientLayer));
}

function reverseWhois(query = "ada@example.com") {
  return fetchViewDnsReverseWhoisEffect(query, KEY, AbortSignal.timeout(5000), {
    userAgent: "watchdog-test",
  }).pipe(Effect.provide(toolsHttpClientLayer));
}

describe("fetchViewDnsReverseHostEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it.effect(
    "asks reversens with the nameserver, page 1, JSON and the key",
    () =>
      Effect.gen(function* nsRequestGen() {
        const seen: URL[] = [];
        mockServer.use(
          http.get(`${BASE}/reversens/`, ({ request }) => {
            seen.push(new URL(request.url));
            return HttpResponse.json({ response: { domains: [] } });
          })
        );

        yield* reverseHost("ns");

        expect(seen).toHaveLength(1);
        expect(Object.fromEntries(seen[0]?.searchParams ?? [])).toEqual({
          ns: "ns1.example.net",
          page: "1",
          output: "json",
          apikey: KEY,
        });
      })
  );

  it.effect("asks reversemx with the mail server in the mx parameter", () =>
    Effect.gen(function* mxRequestGen() {
      const seen: URL[] = [];
      mockServer.use(
        http.get(`${BASE}/reversemx/`, ({ request }) => {
          seen.push(new URL(request.url));
          return HttpResponse.json({ response: { domains: [] } });
        })
      );

      yield* reverseHost("mx", "mail.example.net");

      expect(seen[0]?.searchParams.get("mx")).toBe("mail.example.net");
      expect(seen[0]?.searchParams.get("ns")).toBeNull();
    })
  );

  it.effect("reads domain objects for NS and coerces string counts", () =>
    Effect.gen(function* nsObjectsGen() {
      mockServer.use(
        http.get(`${BASE}/reversens/`, () =>
          HttpResponse.json({
            query: { tool: "reversens", ns: "ns1.example.net" },
            response: {
              domain_count: "85",
              total_pages: "1",
              current_page: "1",
              domains: [
                { domain: "Alpha.example" },
                { domain: "beta.example." },
                { domain: "alpha.example" },
                { domain: "not a domain" },
                { other: "x" },
                "plain.example",
              ],
            },
          })
        )
      );

      const snap = yield* reverseHost("ns");

      expect(snap).toMatchObject({
        server: "ns1.example.net",
        via: "ns",
        source: "api.viewdns.info",
        domainCount: 85,
        totalPages: 1,
        domains: ["alpha.example", "beta.example"],
      });
    })
  );

  it.effect("reads plain strings for MX and drops repeats", () =>
    Effect.gen(function* mxStringsGen() {
      mockServer.use(
        http.get(`${BASE}/reversemx/`, () =>
          HttpResponse.json({
            response: {
              domain_count: 3,
              total_pages: "2",
              domains: ["One.example", "two.example", "one.example", ""],
            },
          })
        )
      );

      const snap = yield* reverseHost("mx", "mail.example.net");

      expect(snap.via).toBe("mx");
      expect(snap.domains).toEqual(["one.example", "two.example"]);
      expect(snap.domainCount).toBe(3);
      expect(snap.totalPages).toBe(2);
    })
  );

  it.effect(
    "fails as rate limited when a 200 says the query limit is used up",
    () =>
      Effect.gen(function* quotaGen() {
        mockServer.use(
          http.get(`${BASE}/reversens/`, () =>
            HttpResponse.json({
              response: {
                error: "Query limit reached for the supplied API key.",
              },
            })
          )
        );

        const failure = yield* reverseHost("ns").pipe(Effect.flip);

        expect(failure._tag).toBe("RateLimitedError");
        expect(failure.message).not.toContain(KEY);
      })
  );

  it.effect("fails as an HTTP 401 when a 200 says the API key is invalid", () =>
    Effect.gen(function* invalidKeyGen() {
      mockServer.use(
        http.get(`${BASE}/reversens/`, () =>
          HttpResponse.json({
            response: { error: `Invalid API Key supplied: ${KEY}` },
          })
        )
      );

      const failure = yield* reverseHost("ns").pipe(Effect.flip);

      expect(failure._tag).toBe("HttpVendorError");
      expect(failure.message).toBe("ViewDNS rejected the API key");
    })
  );

  it.effect("fails with a fixed sentence on any other 200 error text", () =>
    Effect.gen(function* otherErrorGen() {
      mockServer.use(
        http.get(`${BASE}/reversens/`, () =>
          HttpResponse.json({ response: { error: "Something odd upstream" } })
        )
      );

      const failure = yield* reverseHost("ns").pipe(Effect.flip);

      expect(failure._tag).toBe("ParseVendorError");
      expect(failure.message).toBe("ViewDNS reported an error");
    })
  );

  it.effect("fails cleanly when a 200 body is the bare quota text", () =>
    Effect.gen(function* bareTextGen() {
      mockServer.use(
        http.get(
          `${BASE}/reversens/`,
          () =>
            new HttpResponse("Query limit reached for the supplied API key.", {
              status: 200,
              headers: { "Content-Type": "text/html" },
            })
        )
      );

      const failure = yield* reverseHost("ns").pipe(Effect.flip);

      expect(failure._tag).toBe("ParseVendorError");
      expect(failure.message).toContain("query limit may be used up");
      expect(failure.message).not.toContain(KEY);
    })
  );

  it.effect("fails when a 2xx body has no response object", () =>
    Effect.gen(function* noResponseGen() {
      mockServer.use(
        http.get(`${BASE}/reversens/`, () =>
          HttpResponse.json({ query: { tool: "reversens" } })
        )
      );

      const failure = yield* reverseHost("ns").pipe(Effect.flip);

      expect(failure._tag).toBe("ParseVendorError");
    })
  );

  it.effect(
    "returns an empty list when ViewDNS leaves out domains for a count of 0",
    () =>
      Effect.gen(function* emptyResultGen() {
        mockServer.use(
          http.get(`${BASE}/reversens/`, () =>
            HttpResponse.json({
              query: {
                tool: "reversens_PRO",
                nameserver: "ns1.no-such-zone.example",
              },
              response: {
                domain_count: "0",
                total_pages: "0",
                current_page: "1",
              },
            })
          )
        );

        const snap = yield* reverseHost("ns");

        expect(snap.domains).toEqual([]);
        expect(snap.domainCount).toBe(0);
        expect(snap.totalPages).toBe(0);
      })
  );

  it.effect(
    "fails when a 2xx response has no domains array but a non-zero count",
    () =>
      Effect.gen(function* noDomainsGen() {
        mockServer.use(
          http.get(`${BASE}/reversemx/`, () =>
            HttpResponse.json({ response: { domain_count: "12" } })
          )
        );

        const failure = yield* reverseHost("mx").pipe(Effect.flip);

        expect(failure._tag).toBe("ParseVendorError");
      })
  );

  it.effect("rejects a 401 status without echoing the key", () =>
    Effect.gen(function* status401Gen() {
      mockServer.use(
        http.get(`${BASE}/reversens/`, () =>
          HttpResponse.json(
            {
              success: false,
              error: { code: 401, message: "Invalid API key." },
            },
            { status: 401 }
          )
        )
      );

      const failure = yield* reverseHost("ns").pipe(Effect.flip);

      expect(failure._tag).toBe("HttpVendorError");
      expect(failure.message).toBe("ViewDNS HTTP 401");
      expect(failure.message).not.toContain(KEY);
    })
  );
});

describe("fetchViewDnsReverseWhoisEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it.effect("asks reversewhois with the query, page 1, JSON and the key", () =>
    Effect.gen(function* whoisRequestGen() {
      const seen: URL[] = [];
      mockServer.use(
        http.get(`${BASE}/reversewhois/`, ({ request }) => {
          seen.push(new URL(request.url));
          return HttpResponse.json({ response: { matches: [] } });
        })
      );

      yield* reverseWhois("  Ada Lovelace ");

      expect(Object.fromEntries(seen[0]?.searchParams ?? [])).toEqual({
        q: "Ada Lovelace",
        page: "1",
        output: "json",
        apikey: KEY,
      });
    })
  );

  it.effect("returns normalized, deduped matches with coerced counts", () =>
    Effect.gen(function* whoisMatchesGen() {
      mockServer.use(
        http.get(`${BASE}/reversewhois/`, () =>
          HttpResponse.json({
            query: { tool: "reversewhois", q: "ada@example.com" },
            response: {
              result_count: "3",
              total_pages: "1",
              current_page: "1",
              matches: [
                {
                  domain: "Alpha.example",
                  created_date: "2020-01-02",
                  registrar: "Example Registrar, Inc.",
                },
                { domain: "alpha.example", registrar: "Duplicate" },
                { domain: "beta.example", created_date: "", registrar: 7 },
                { domain: "bad domain" },
                "stray",
              ],
            },
          })
        )
      );

      const snap = yield* reverseWhois();

      expect(snap).toMatchObject({
        query: "ada@example.com",
        source: "api.viewdns.info",
        resultCount: 3,
        totalPages: 1,
      });
      expect(snap.matches).toEqual([
        {
          domain: "alpha.example",
          createdDate: "2020-01-02",
          registrar: "Example Registrar, Inc.",
        },
        { domain: "beta.example", createdDate: null, registrar: null },
      ]);
    })
  );

  it.effect(
    "fails with the paid-plan message on the demonstration marker",
    () =>
      Effect.gen(function* demoGen() {
        mockServer.use(
          http.get(`${BASE}/reversewhois/`, () =>
            HttpResponse.json({
              query: { tool: "reversewhois", query: DEMO_MARKER },
              response: {
                result_count: "1",
                matches: [{ domain: "demo.example" }],
              },
            })
          )
        );

        const failure = yield* reverseWhois().pipe(Effect.flip);

        expect(failure._tag).toBe("ValidationVendorError");
        expect(failure.message).toBe(
          "ViewDNS reverse WHOIS needs a paid ViewDNS plan"
        );
      })
  );

  it.effect(
    "returns no matches when ViewDNS leaves out the array for a count of 0",
    () =>
      Effect.gen(function* emptyWhoisGen() {
        mockServer.use(
          http.get(`${BASE}/reversewhois/`, () =>
            HttpResponse.json({
              query: {
                tool: "reversewhois_PRO",
                query: "nobody@nowhere.example",
              },
              response: {
                result_count: "0",
                total_pages: "0",
                current_page: "1",
              },
            })
          )
        );

        const snap = yield* reverseWhois("nobody@nowhere.example");

        expect(snap.matches).toEqual([]);
        expect(snap.resultCount).toBe(0);
      })
  );

  it.effect(
    "fails when a 2xx response has no matches array but a non-zero count",
    () =>
      Effect.gen(function* noMatchesGen() {
        mockServer.use(
          http.get(`${BASE}/reversewhois/`, () =>
            HttpResponse.json({ response: { result_count: "4" } })
          )
        );

        const failure = yield* reverseWhois().pipe(Effect.flip);

        expect(failure._tag).toBe("ParseVendorError");
      })
  );

  it.effect("fails as rate limited on the legacy quota error", () =>
    Effect.gen(function* whoisQuotaGen() {
      mockServer.use(
        http.get(`${BASE}/reversewhois/`, () =>
          HttpResponse.json({
            response: {
              error: "Query limit reached for the supplied API key.",
            },
          })
        )
      );

      const failure = yield* reverseWhois().pipe(Effect.flip);

      expect(failure._tag).toBe("RateLimitedError");
    })
  );
});
