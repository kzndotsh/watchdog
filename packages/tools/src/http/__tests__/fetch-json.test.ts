import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import {
  RateLimitedError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { fetchJsonObjectEffect, RATE_LIMIT_RETRIES } from "../fetch-json";
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
      });

      expect(result.body).toEqual({ ok: true });
      expect(result.status).toBe(200);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect(
    "fails a 429 whose Retry-After is past the cap at once, without waiting",
    () =>
      Effect.gen(function* fetchJsonObjectRateLimitedGen() {
        const fetch = vi.fn().mockResolvedValue(
          new Response(null, {
            status: 429,
            headers: { "retry-after": "60" },
          })
        );
        vi.stubGlobal("fetch", fetch);
        const started = Date.now();

        const outcome = yield* Effect.result(
          fetchJsonObjectEffect({
            url: "https://example.com/api",
            signal: AbortSignal.timeout(5000),
            service: "Example",
            subject: "test",
          })
        );

        expect(Result.isFailure(outcome)).toBe(true);
        if (Result.isFailure(outcome)) {
          expect(outcome.failure).toBeInstanceOf(RateLimitedError);
        }
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(Date.now() - started).toBeLessThan(1000);
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

  it.effect("stops retrying a repeated 429 and fails as rate-limited", () =>
    Effect.gen(function* fetchJsonObjectRepeatedRateLimitGen() {
      const fetch = vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(
            new Response(null, { status: 429, headers: { "retry-after": "0" } })
          )
        );
      vi.stubGlobal("fetch", fetch);

      const outcome = yield* Effect.result(
        fetchJsonObjectEffect({
          url: "https://example.com/api",
          signal: AbortSignal.timeout(5000),
          service: "Example",
          subject: "test",
        })
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(RateLimitedError);
      }
      expect(fetch).toHaveBeenCalledTimes(1 + RATE_LIMIT_RETRIES);
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
        })
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("rejects OPTIONS, TRACE and QUERY methods", () =>
    Effect.gen(function* fetchJsonUnsupportedMethodGen() {
      for (const method of ["OPTIONS", "TRACE", "QUERY"] as const) {
        const outcome = yield* Effect.result(
          fetchJsonObjectEffect({
            url: "https://example.com/api",
            init: { method },
            signal: AbortSignal.timeout(5000),
            service: "Example",
            subject: "test",
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
