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

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { submitWaybackSaveEffect } from "../submit.ts";

describe("submitWaybackSaveEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });
  afterEach(() => {
    mockServer.resetHandlers();
  });
  afterAll(() => {
    mockServer.close();
  });

  it.effect("treats HTTP 429 as accepted (status < 500)", () =>
    Effect.gen(function* submitWayback429Gen() {
      mockServer.use(
        http.get(
          /https:\/\/web\.archive\.org\/save\//,
          () => new HttpResponse("slow down", { status: 429 })
        )
      );
      const snap = yield* submitWaybackSaveEffect(
        "https://example.com/",
        new AbortController().signal
      );
      expect(snap.results[0]?.accepted).toBe(true);
      expect(snap.results[0]?.status).toBe(429);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("does not accept HTTP 503", () =>
    Effect.gen(function* submitWayback503Gen() {
      mockServer.use(
        http.get(
          /https:\/\/web\.archive\.org\/save\//,
          () => new HttpResponse("unavailable", { status: 503 })
        )
      );
      const snap = yield* submitWaybackSaveEffect(
        "https://example.com/",
        new AbortController().signal
      );
      expect(snap.results[0]?.accepted).toBe(false);
      expect(snap.results[0]?.status).toBe(503);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
