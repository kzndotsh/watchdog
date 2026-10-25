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
  ParseVendorError,
  RateLimitedError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchWaybackCaptureEffect, waybackArchiveUrl } from "../capture";
import { parseCdxPayload } from "../cdx-parse";
import { countDigestChanges, fetchWaybackLookupEffect } from "../cdx.ts";

const CDX_URL = /https:\/\/web\.archive\.org\/cdx\/search\/cdx/;
const HEADER = [
  "timestamp",
  "original",
  "statuscode",
  "mimetype",
  "digest",
  "length",
];
const ROW_A = [
  "20190101000000",
  "https://example.com/",
  "200",
  "text/html",
  "AAA",
  "111",
];
const ROW_B = [
  "20200101000000",
  "https://example.com/",
  "-",
  "warc/revisit",
  "BBB",
  "222",
];

type Seen = { params: URLSearchParams }[];

function serve(
  respond: (params: URLSearchParams) => Response,
  seen: Seen = []
) {
  mockServer.use(
    http.get(CDX_URL, ({ request }) => {
      const params = new URL(request.url).searchParams;
      seen.push({ params });
      return respond(params);
    })
  );
  return seen;
}

const options = { userAgent: "watchdog-test" } as const;
const signal = () => new AbortController().signal;
const lookup = (
  opts: Parameters<typeof fetchWaybackLookupEffect>[2] = options
) => fetchWaybackLookupEffect("https://example.com/", signal(), opts);

describe("fetchWaybackLookupEffect: versions", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it.effect("parses a page that ends with a resume key", () =>
    Effect.gen(function* resumeKeyGen() {
      serve(() => HttpResponse.json([HEADER, ROW_A, ROW_B, [], ["KEY123"]]));
      const snap = yield* lookup({ ...options, limit: 2 });
      expect(snap.rows.map((r) => r.timestamp)).toEqual([
        "20190101000000",
        "20200101000000",
      ]);
      expect(snap.rows[0]).toMatchObject({
        statuscode: "200",
        mimetype: "text/html",
        digest: "AAA",
        length: 111,
      });
      expect(snap.resumeKey).toBe("KEY123");
      expect(snap.isTruncated).toBe(true);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("has no resume key and is not truncated on a complete page", () =>
    Effect.gen(function* noResumeKeyGen() {
      serve(() => HttpResponse.json([HEADER, ROW_A, ROW_B]));
      const snap = yield* lookup();
      expect(snap.rows).toHaveLength(2);
      expect(snap.resumeKey).toBeNull();
      expect(snap.isTruncated).toBe(false);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("sends the resume key, the limit and asks for a key back", () =>
    Effect.gen(function* sendResumeKeyGen() {
      const seen = serve(() => HttpResponse.json([HEADER, ROW_A]));
      yield* lookup({ ...options, limit: 7, resumeKey: "PREV" });
      const params = seen[0]?.params;
      expect(params?.get("resumeKey")).toBe("PREV");
      expect(params?.get("limit")).toBe("7");
      expect(params?.get("showResumeKey")).toBe("true");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect(
    "collapses by digest only when asked, and counts the captures",
    () =>
      Effect.gen(function* collapseGen() {
        const rows = Array.from({ length: 37 }, (_, i) => [
          `2019${String(i + 1).padStart(10, "0")}`,
        ]);
        const seen = serve((params) =>
          params.get("collapse") === "digest"
            ? HttpResponse.json([HEADER, ROW_A, ROW_B])
            : HttpResponse.json([["timestamp"], ...rows])
        );
        const snap = yield* lookup({ ...options, distinctOnly: true });
        expect(seen[0]?.params.get("collapse")).toBe("digest");
        expect(snap.distinctOnly).toBe(true);
        expect(snap.distinctVersions).toBe(2);
        expect(snap.totalCaptures).toBe(37);
        expect(snap.totalCapturesIsLowerBound).toBe(false);

        const all = serve(() =>
          HttpResponse.json([HEADER, ROW_A, ROW_A, ROW_B])
        );
        const plain = yield* lookup();
        expect(all[0]?.params.has("collapse")).toBe(false);
        expect(plain.distinctOnly).toBe(false);
        expect(plain.totalCaptures).toBe(3);
        expect(plain.distinctVersions).toBe(2);
      }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("reports the capture count as unknown when counting fails", () =>
    Effect.gen(function* countFailsGen() {
      serve((params) =>
        params.get("collapse") === "digest"
          ? HttpResponse.json([HEADER, ROW_A])
          : new HttpResponse("busy", { status: 503 })
      );
      const snap = yield* lookup({ ...options, distinctOnly: true });
      expect(snap.rows).toHaveLength(1);
      expect(snap.totalCaptures).toBeNull();
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("turns the bounds into inclusive from/to timestamps", () =>
    Effect.gen(function* boundsGen() {
      const seen = serve(() => HttpResponse.json([HEADER, ROW_A]));
      const snap = yield* lookup({
        ...options,
        after: "2019",
        before: "2020-02",
      });
      expect(seen[0]?.params.get("from")).toBe("20190101000000");
      expect(seen[0]?.params.get("to")).toBe("20200229235959");
      expect(snap.from).toBe("20190101000000");
      expect(snap.to).toBe("20200229235959");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect(
    "rejects a bad bound, and after later than before, before any request",
    () =>
      Effect.gen(function* badBoundsGen() {
        const seen = serve(() => HttpResponse.json([]));
        const bad = yield* Effect.result(
          lookup({ ...options, after: "2019-13" })
        );
        const badBefore = yield* Effect.result(
          lookup({ ...options, before: "soon" })
        );
        const reversed = yield* Effect.result(
          lookup({ ...options, after: "2020", before: "2019" })
        );
        for (const outcome of [bad, badBefore, reversed]) {
          expect(Result.isFailure(outcome)).toBe(true);
          if (Result.isFailure(outcome)) {
            expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
          }
        }
        expect(seen).toHaveLength(0);
      }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect(
    "keeps 200 and `-` captures with the ok filter, 200 alone by default, all on any",
    () =>
      Effect.gen(function* statusFilterGen() {
        const seen = serve(() => HttpResponse.json([]));
        yield* lookup({ ...options, statusFilter: "ok" });
        yield* lookup();
        yield* lookup({ ...options, statusFilter: "any" });
        expect(seen.map((s) => s.params.get("filter"))).toEqual([
          "statuscode:(200|-)",
          "statuscode:200",
          null,
        ]);
      }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});

describe("fetchWaybackLookupEffect: failing honestly", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it.effect("retries a 429 once after a short Retry-After, then succeeds", () =>
    Effect.gen(function* retryOnceGen() {
      let calls = 0;
      serve(() => {
        calls += 1;
        return calls === 1
          ? new HttpResponse("slow down", {
              status: 429,
              headers: { "retry-after": "0" },
            })
          : HttpResponse.json([HEADER, ROW_A]);
      });
      const snap = yield* lookup();
      expect(calls).toBe(2);
      expect(snap.rows).toHaveLength(1);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect(
    "reports a persistent 429 as rate limited, not as no captures",
    () =>
      Effect.gen(function* persistent429Gen() {
        let calls = 0;
        serve(() => {
          calls += 1;
          return new HttpResponse("slow down", {
            status: 429,
            headers: { "retry-after": "0" },
          });
        });
        const outcome = yield* Effect.result(lookup());
        expect(Result.isFailure(outcome)).toBe(true);
        if (Result.isFailure(outcome)) {
          expect(outcome.failure).toBeInstanceOf(RateLimitedError);
        }
        expect(calls).toBe(2);
      }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("does not wait out a long Retry-After inside the Job", () =>
    Effect.gen(function* longRetryAfterGen() {
      let calls = 0;
      serve(() => {
        calls += 1;
        return new HttpResponse("slow down", {
          status: 429,
          headers: { "retry-after": "120" },
        });
      });
      const started = Date.now();
      const outcome = yield* Effect.result(lookup());
      expect(Date.now() - started).toBeLessThan(2000);
      expect(calls).toBe(1);
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(RateLimitedError);
        expect(outcome.failure).toMatchObject({ retryAfterMs: 120_000 });
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("fails on an HTML error page where JSON is expected", () =>
    Effect.gen(function* htmlBodyGen() {
      serve(
        () =>
          new HttpResponse("<html><body>Too many requests</body></html>", {
            status: 200,
            headers: { "content-type": "text/html" },
          })
      );
      const outcome = yield* Effect.result(lookup());
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ParseVendorError);
        expect(outcome.failure.message).toMatch(/instead of JSON/);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});

describe("parseCdxPayload and countDigestChanges", () => {
  it("never reads the resume-key tail as a capture", () => {
    const parsed = parseCdxPayload(
      [HEADER, ROW_A, [], ["KEY"]],
      "https://example.com/"
    );
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.resumeKey).toBe("KEY");
  });

  it("counts a version each time the digest changes, a return included", () => {
    const row = (digest: string) => ({
      timestamp: "20190101000000",
      original: "https://example.com/",
      digest,
    });
    expect(countDigestChanges([])).toBe(0);
    expect(countDigestChanges([row("A"), row("A"), row("B"), row("A")])).toBe(
      3
    );
  });
});

describe("fetchWaybackCaptureEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it("builds the raw id_ URL", () => {
    expect(
      waybackArchiveUrl("20190101000000", "https://example.com/a?b=1")
    ).toBe(
      "https://web.archive.org/web/20190101000000id_/https://example.com/a?b=1"
    );
  });

  it.effect("requests the id_ capture and cuts the body at the byte cap", () =>
    Effect.gen(function* captureGen() {
      let requested = "";
      mockServer.use(
        http.get(/https:\/\/web\.archive\.org\/web\//, ({ request }) => {
          requested = request.url;
          return new HttpResponse("x".repeat(500), {
            headers: { "content-type": "text/html" },
          });
        })
      );
      const capture = yield* fetchWaybackCaptureEffect(
        "https://example.com/",
        "20190101000000",
        signal(),
        { userAgent: "watchdog-test", maxBytes: 100 }
      );
      expect(requested).toBe(
        "https://web.archive.org/web/20190101000000id_/https://example.com/"
      );
      expect(capture.result.ok).toBe(true);
      expect(capture.result.bytes.byteLength).toBe(100);
      expect(capture.truncated).toBe(true);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
