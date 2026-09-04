import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { Effect } from "effect";

import { http, HttpResponse, mockServer } from "@watchdog/test-kit/http";

import { toolsHttpClientLayer } from "../http-client-layer";
import { fetchUnshortenEffect, isBlockedUnshortenUrl } from "../unshorten.ts";

describe("fetchUnshortenEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
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

  it("blocks private, loopback, link-local, and CGNAT hops", () => {
    expect(isBlockedUnshortenUrl("http://127.0.0.1/")).toBe(true);
    expect(isBlockedUnshortenUrl("http://10.0.0.1/")).toBe(true);
    expect(isBlockedUnshortenUrl("http://192.168.1.1/")).toBe(true);
    expect(isBlockedUnshortenUrl("http://169.254.1.1/")).toBe(true);
    expect(isBlockedUnshortenUrl("http://100.64.0.1/")).toBe(true);
    expect(isBlockedUnshortenUrl("http://[::1]/")).toBe(true);
    expect(isBlockedUnshortenUrl("https://example.com/")).toBe(false);
  });
});
