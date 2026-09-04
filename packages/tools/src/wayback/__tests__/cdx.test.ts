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

import { HttpVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchWaybackLookupEffect } from "../cdx.ts";

describe("fetchWaybackLookupEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it.effect("returns empty rows on HTTP 200 with no snapshots", () =>
    Effect.gen(function* fetchWaybackLookupEmptyGen() {
      mockServer.use(
        http.get(/https:\/\/web\.archive\.org\/cdx\/search\/cdx/, () =>
          HttpResponse.json([])
        )
      );
      const snap = yield* fetchWaybackLookupEffect(
        "https://example.com/",
        new AbortController().signal,
        {
          userAgent: "watchdog-test",
        }
      );
      expect(snap.rows).toEqual([]);
      expect(snap.closestTimestamp).toBeNull();
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("fails on a non-OK CDX response", () =>
    Effect.gen(function* fetchWaybackLookupFailGen() {
      mockServer.use(
        http.get(
          /https:\/\/web\.archive\.org\/cdx\/search\/cdx/,
          () => new HttpResponse("unavailable", { status: 503 })
        )
      );
      const outcome = yield* Effect.result(
        fetchWaybackLookupEffect(
          "https://example.com/",
          new AbortController().signal,
          {
            userAgent: "watchdog-test",
          }
        )
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(HttpVendorError);
        expect(outcome.failure).toMatchObject({
          service: "Wayback CDX",
          status: 503,
        });
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
