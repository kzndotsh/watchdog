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
import { fetchSecurityTrailsLookupEffect } from "../securitytrails";

const SUBDOMAINS =
  "https://api.securitytrails.com/v1/domain/example.com/subdomains";
const HISTORY = "https://api.securitytrails.com/v1/history/example.com/dns/a";

function lookup() {
  return fetchSecurityTrailsLookupEffect(
    "Example.com",
    "st-key",
    AbortSignal.timeout(5000),
    { userAgent: "watchdog-test" }
  ).pipe(Effect.provide(toolsHttpClientLayer));
}

describe("fetchSecurityTrailsLookupEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it.effect("sends the key in the APIKEY header on both calls", () =>
    Effect.gen(function* sendsApiKeyGen() {
      const keys: (string | null)[] = [];
      mockServer.use(
        http.get(SUBDOMAINS, ({ request }) => {
          keys.push(request.headers.get("APIKEY"));
          return HttpResponse.json({ subdomains: [] });
        }),
        http.get(HISTORY, ({ request }) => {
          keys.push(request.headers.get("APIKEY"));
          return HttpResponse.json({ pages: 1, records: [] });
        })
      );

      yield* lookup();

      expect(keys).toEqual(["st-key", "st-key"]);
    })
  );

  it.effect("turns subdomain labels into names under the queried domain", () =>
    Effect.gen(function* labelsToNamesGen() {
      mockServer.use(
        http.get(SUBDOMAINS, () =>
          HttpResponse.json({
            subdomains: ["www", "API", "mail.", "www", ""],
            subdomain_count: 4,
          })
        ),
        http.get(HISTORY, () => HttpResponse.json({ pages: 1, records: [] }))
      );

      const snap = yield* lookup();

      expect(snap.host).toBe("example.com");
      expect(snap.subdomains).toEqual([
        "www.example.com",
        "api.example.com",
        "mail.example.com",
      ]);
      expect(snap.subdomainCount).toBe(4);
    })
  );

  it.effect("flattens A history into one sighting per IP value", () =>
    Effect.gen(function* flattensHistoryGen() {
      mockServer.use(
        http.get(SUBDOMAINS, () => HttpResponse.json({ subdomains: [] })),
        http.get(HISTORY, () =>
          HttpResponse.json({
            pages: 3,
            type: "a/ipv4",
            records: [
              {
                first_seen: "2017-05-26",
                last_seen: "2018-01-02",
                organizations: ["netDNA"],
                values: [
                  { ip: "200.121.20.1", ip_count: 10_231 },
                  { ip: "not-an-ip" },
                ],
              },
            ],
          })
        )
      );

      const snap = yield* lookup();

      expect(snap.ipHistory).toEqual([
        {
          ip: "200.121.20.1",
          firstSeen: "2017-05-26",
          lastSeen: "2018-01-02",
          organizations: ["netDNA"],
        },
      ]);
      expect(snap.historyPages).toBe(3);
    })
  );

  it.effect("returns an empty snapshot when SecurityTrails answers 404", () =>
    Effect.gen(function* notFoundGen() {
      mockServer.use(
        http.get(SUBDOMAINS, () =>
          HttpResponse.json({ message: "Not found" }, { status: 404 })
        ),
        http.get(HISTORY, () =>
          HttpResponse.json({ message: "Not found" }, { status: 404 })
        )
      );

      const snap = yield* lookup();

      expect(snap.subdomains).toEqual([]);
      expect(snap.ipHistory).toEqual([]);
    })
  );

  it.effect("fails when a 2xx body has no subdomains array", () =>
    Effect.gen(function* missingSubdomainsGen() {
      mockServer.use(
        http.get(SUBDOMAINS, () => HttpResponse.json({ endpoint: "/v1" }))
      );

      const failure = yield* lookup().pipe(Effect.flip);

      expect(failure._tag).toBe("ParseVendorError");
    })
  );

  it.effect("fails when a 2xx history body has no records array", () =>
    Effect.gen(function* missingRecordsGen() {
      mockServer.use(
        http.get(SUBDOMAINS, () => HttpResponse.json({ subdomains: [] })),
        http.get(HISTORY, () => HttpResponse.json({ pages: 1 }))
      );

      const failure = yield* lookup().pipe(Effect.flip);

      expect(failure._tag).toBe("ParseVendorError");
    })
  );

  it.effect("rejects a refused key without echoing it", () =>
    Effect.gen(function* rejectedKeyGen() {
      mockServer.use(
        http.get(SUBDOMAINS, () =>
          HttpResponse.json({ message: "Invalid API key" }, { status: 401 })
        )
      );

      const failure = yield* lookup().pipe(Effect.flip);

      expect(failure._tag).toBe("HttpVendorError");
      expect(failure.message).toBe("SecurityTrails HTTP 401");
      expect(failure.message).not.toContain("st-key");
    })
  );
});
