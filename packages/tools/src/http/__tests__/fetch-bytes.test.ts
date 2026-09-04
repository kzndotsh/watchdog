import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "@effect/vitest";
import { Effect } from "effect";

import {
  http,
  HttpResponse,
  mockJson,
  mockServer,
} from "@watchdog/test-kit/http";

import { fetchBytesEffect } from "../fetch-bytes.ts";
import { toolsHttpClientLayer } from "../http-client-layer";

describe("fetchBytesEffect", () => {
  beforeAll(() => {
    mockServer.listen({ onUnhandledRequest: "error" });
  });

  afterEach(() => {
    mockServer.resetHandlers();
  });

  afterAll(() => {
    mockServer.close();
  });

  it.effect("returns truncated bytes and status from the mocked response", () =>
    Effect.gen(function* fetchBytesTruncatedGen() {
      mockJson("https://example.test/page", { hello: "world" });
      const result = yield* fetchBytesEffect(
        "https://example.test/page",
        new AbortController().signal,
        { userAgent: "watchdog-test", maxBytes: 16, accept: "application/json" }
      );
      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);
      expect(result.bytes.byteLength).toBeLessThanOrEqual(16);
      expect(new TextDecoder().decode(result.bytes)).toContain("{");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("returns HTTP error details when the mocked status is not ok", () =>
    Effect.gen(function* fetchBytesHttpErrorGen() {
      mockJson(
        "https://example.test/missing",
        { error: "nope" },
        { status: 404 }
      );
      const result = yield* fetchBytesEffect(
        "https://example.test/missing",
        new AbortController().signal,
        { userAgent: "watchdog-test", maxBytes: 1024 }
      );
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/HTTP 404/);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("cuts the body at maxBytes", () =>
    Effect.gen(function* fetchBytesMaxBytesGen() {
      mockServer.use(
        http.get("https://example.test/long", () =>
          HttpResponse.text("abcdefghij")
        )
      );
      const result = yield* fetchBytesEffect(
        "https://example.test/long",
        new AbortController().signal,
        { userAgent: "watchdog-test", maxBytes: 4 }
      );
      expect(result.bytes.byteLength).toBe(4);
      expect(new TextDecoder().decode(result.bytes)).toBe("abcd");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("returns an error when the signal is aborted", () =>
    Effect.gen(function* fetchBytesAbortedGen() {
      const controller = new AbortController();
      controller.abort();
      const result = yield* fetchBytesEffect(
        "https://example.test/page",
        controller.signal,
        { userAgent: "watchdog-test", maxBytes: 1024 }
      );
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/abort/i);
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
