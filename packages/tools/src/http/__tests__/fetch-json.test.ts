import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import {
  RateLimitedError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { fetchJsonObjectEffect } from "../fetch-json";
import { toolsHttpClientLayer } from "../http-client-layer";

describe("fetchJsonObjectEffect", () => {
  it.effect("returns parsed JSON objects on success", () =>
    Effect.gen(function* fetchJsonObjectSuccessGen() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            new Response(JSON.stringify({ ok: true }), { status: 200 })
          )
      );

      const result = yield* fetchJsonObjectEffect({
        url: "https://example.com/api",
        signal: AbortSignal.timeout(5000),
        service: "Example",
        subject: "test",
        retry: false,
      });

      expect(result.body).toEqual({ ok: true });
      expect(result.status).toBe(200);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("maps HTTP 429 to RateLimitedError", () =>
    Effect.gen(function* fetchJsonObjectRateLimitedGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 429 }))
      );

      const outcome = yield* Effect.result(
        fetchJsonObjectEffect({
          url: "https://example.com/api",
          signal: AbortSignal.timeout(5000),
          service: "Example",
          subject: "test",
          retry: false,
        })
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(RateLimitedError);
      }
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("retries 429 responses after Retry-After", () =>
    Effect.gen(function* fetchJsonObjectRetryAfterGen() {
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => {
          calls += 1;
          if (calls === 1) {
            return Promise.resolve(
              new Response(null, {
                status: 429,
                headers: { "retry-after": "0" },
              })
            );
          }
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true }), { status: 200 })
          );
        })
      );

      const result = yield* fetchJsonObjectEffect({
        url: "https://example.com/api",
        signal: AbortSignal.timeout(5000),
        service: "Example",
        subject: "test",
      });

      expect(calls).toBe(2);
      expect(result.body).toEqual({ ok: true });
      expect(result.status).toBe(200);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("rejects unsupported HTTP methods", () =>
    Effect.gen(function* fetchJsonInvalidMethodGen() {
      const outcome = yield* Effect.result(
        fetchJsonObjectEffect({
          url: "https://example.com/api",
          init: { method: "POS" },
          signal: AbortSignal.timeout(5000),
          service: "Example",
          subject: "test",
          retry: false,
        })
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("rejects OPTIONS and TRACE methods", () =>
    Effect.gen(function* fetchJsonUnsupportedMethodGen() {
      for (const method of ["OPTIONS", "TRACE"] as const) {
        const outcome = yield* Effect.result(
          fetchJsonObjectEffect({
            url: "https://example.com/api",
            init: { method },
            signal: AbortSignal.timeout(5000),
            service: "Example",
            subject: "test",
            retry: false,
          })
        );

        expect(Result.isFailure(outcome)).toBe(true);
        if (Result.isFailure(outcome)) {
          expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
          expect(outcome.failure.message).toMatch(/unsupported HTTP method/);
        }
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
