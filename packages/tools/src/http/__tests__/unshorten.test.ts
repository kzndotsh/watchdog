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

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../http-client-layer";
import { fetchUnshortenEffect } from "../unshorten.ts";

describe("fetchUnshortenEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledFrame: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it.effect("records the hop chain and final URL", () =>
    Effect.gen(function* fetchUnshortenHopsGen() {
      mockServer.use(
        http.head(
          "https://t.co/abc",
          () =>
            new HttpResponse(null, {
              status: 301,
              headers: { location: "https://mailhost.test/final" },
            })
        ),
        http.head(
          "https://mailhost.test/final",
          () => new HttpResponse(null, { status: 200 })
        )
      );
      const snap = yield* fetchUnshortenEffect(
        "https://t.co/abc",
        new AbortController().signal,
        { userAgent: "watchdog-test", maxHops: 5 }
      );
      expect(snap.finalUrl).toBe("https://mailhost.test/final");
      expect(snap.hopCount).toBe(1);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("rejects non-http(s) URLs before probing", () =>
    Effect.gen(function* rejectBadSchemeGen() {
      const outcome = yield* Effect.result(
        fetchUnshortenEffect(
          "file:///etc/passwd",
          new AbortController().signal,
          {
            userAgent: "watchdog-test",
          }
        )
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("reports an error when redirect hops exceed maxHops", () =>
    Effect.gen(function* redirectLimitGen() {
      mockServer.use(
        http.head(
          "https://hop.test/a",
          () =>
            new HttpResponse(null, {
              status: 301,
              headers: { location: "https://hop.test/b" },
            })
        ),
        http.head(
          "https://hop.test/b",
          () =>
            new HttpResponse(null, {
              status: 301,
              headers: { location: "https://hop.test/c" },
            })
        ),
        http.head(
          "https://hop.test/c",
          () =>
            new HttpResponse(null, {
              status: 301,
              headers: { location: "https://hop.test/d" },
            })
        )
      );
      const snap = yield* fetchUnshortenEffect(
        "https://hop.test/a",
        new AbortController().signal,
        { userAgent: "watchdog-test", maxHops: 2 }
      );
      expect(snap.error).toBe("Redirect hop limit exceeded (2)");
      expect(snap.chain).toHaveLength(2);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("stops at a redirect hop to a private address", () =>
    Effect.gen(function* blockedHopGen() {
      mockServer.use(
        http.head(
          "https://t.co/internal",
          () =>
            new HttpResponse(null, {
              status: 302,
              headers: { location: "http://10.0.0.5/admin" },
            })
        )
      );
      const snap = yield* fetchUnshortenEffect(
        "https://t.co/internal",
        new AbortController().signal,
        { userAgent: "watchdog-test" }
      );
      expect(snap.error).toMatch(/Blocked target/);
      expect(snap.chain).toHaveLength(1);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
