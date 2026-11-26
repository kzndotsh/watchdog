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
  fetchSecurityTrailsLookupEffect,
  type SecurityTrailsDnsType,
} from "../securitytrails";

const SUBDOMAINS =
  "https://api.securitytrails.com/v1/domain/example.com/subdomains";
const HISTORY =
  "https://api.securitytrails.com/v1/history/example.com/dns/:type";

function lookup(recordTypes: readonly SecurityTrailsDnsType[] = ["a"]) {
  return fetchSecurityTrailsLookupEffect(
    "Example.com",
    "st-key",
    AbortSignal.timeout(5000),
    { userAgent: "watchdog-test", recordTypes }
  ).pipe(Effect.provide(toolsHttpClientLayer));
}

function emptySubdomains() {
  return http.get(SUBDOMAINS, () => HttpResponse.json({ subdomains: [] }));
}

/** Record shapes as SecurityTrails returned them for github.com on 2026-11-26, trimmed. */
const HISTORY_BODIES: Record<string, Record<string, unknown>> = {
  aaaa: { type: "a/ipv6", records: [], pages: 0 },
  mx: {
    type: "mx",
    pages: 1,
    records: [
      {
        type: "mx",
        values: [{ priority: 0, host: "Mail.Example.net.", mx_count: 0 }],
        organizations: ["Microsoft Corporation"],
        first_seen: "2026-03-22",
        last_seen: "2026-11-26",
      },
    ],
  },
  ns: {
    type: "ns",
    pages: 1,
    records: [
      {
        type: "ns",
        values: [
          { nameserver: "dns1.p08.nsone.net", nameserver_count: 0 },
          { nameserver: "ns-1283.awsdns-32.org", nameserver_count: 0 },
        ],
        organizations: [],
        first_seen: "2026-01-01",
        last_seen: "2026-11-26",
      },
    ],
  },
  soa: {
    type: "soa",
    pages: 6,
    records: [
      {
        type: "soa",
        values: {
          ttl: 7200,
          email: "awsdns-hostmaster.amazon.com",
          email_count: 0,
        },
        organizations: ["Amazon.com, Inc."],
        first_seen: "2026-11-18",
        last_seen: "2026-11-26",
      },
    ],
  },
  txt: {
    type: "txt",
    pages: 1,
    records: [
      {
        type: "txt",
        values: [{ value: "v=spf1 -all" }],
        organizations: [],
        first_seen: "2026-01-01",
        last_seen: "2026-11-26",
      },
    ],
  },
};

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

  it.effect("makes one keyed call for subdomains and one per record type", () =>
    Effect.gen(function* oneCallPerTypeGen() {
      const calls: string[] = [];
      mockServer.use(
        http.get(SUBDOMAINS, ({ request }) => {
          calls.push(`subdomains:${request.headers.get("APIKEY")}`);
          return HttpResponse.json({ subdomains: [] });
        }),
        http.get(HISTORY, ({ request, params }) => {
          calls.push(`${String(params.type)}:${request.headers.get("APIKEY")}`);
          return HttpResponse.json({ pages: 1, records: [] });
        })
      );

      yield* lookup(["a", "mx"]);

      expect(calls).toEqual(["subdomains:st-key", "a:st-key", "mx:st-key"]);
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

  it.effect("flattens A history into one sighting per IP, with its alias", () =>
    Effect.gen(function* flattensHistoryGen() {
      mockServer.use(
        emptySubdomains(),
        http.get(HISTORY, () =>
          HttpResponse.json({
            pages: 9,
            type: "a/ipv4",
            records: [
              {
                type: "a",
                cname: "Shops.Example.net.",
                first_seen: "2026-11-21",
                last_seen: "2026-11-26",
                organizations: ["GitHub, Inc."],
                values: [
                  { ip: "140.82.114.3", ip_count: 0 },
                  { ip: "not-an-ip" },
                ],
              },
              {
                type: "a",
                cname: "",
                first_seen: "2026-11-18",
                last_seen: "2026-11-21",
                organizations: [],
                values: [{ ip: "140.82.113.4", ip_count: 0 }],
              },
            ],
          })
        )
      );

      const snap = yield* lookup();

      expect(snap.dnsHistory).toEqual([
        {
          type: "a",
          pages: 9,
          records: [
            {
              value: "140.82.114.3",
              firstSeen: "2026-11-21",
              lastSeen: "2026-11-26",
              organizations: ["GitHub, Inc."],
              cname: "shops.example.net",
            },
            {
              value: "140.82.113.4",
              firstSeen: "2026-11-18",
              lastSeen: "2026-11-21",
              organizations: [],
              cname: null,
            },
          ],
        },
      ]);
    })
  );

  it.effect(
    "reads each record type's value, including SOA's single object",
    () =>
      Effect.gen(function* perTypeValuesGen() {
        mockServer.use(
          emptySubdomains(),
          http.get(HISTORY, ({ params }) =>
            HttpResponse.json(HISTORY_BODIES[String(params.type)] ?? {})
          )
        );

        const snap = yield* lookup(["aaaa", "mx", "ns", "soa", "txt"]);

        expect(
          snap.dnsHistory.map((h) => [
            h.type,
            h.pages,
            h.records.map((r) => r.value),
          ])
        ).toEqual([
          ["aaaa", 0, []],
          ["mx", 1, ["mail.example.net"]],
          ["ns", 1, ["dns1.p08.nsone.net", "ns-1283.awsdns-32.org"]],
          ["soa", 6, ["awsdns-hostmaster.amazon.com"]],
          ["txt", 1, ["v=spf1 -all"]],
        ]);
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

      const snap = yield* lookup(["a", "ns"]);

      expect(snap.subdomains).toEqual([]);
      expect(snap.dnsHistory).toEqual([
        { type: "a", pages: 0, records: [] },
        { type: "ns", pages: 0, records: [] },
      ]);
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
        emptySubdomains(),
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
