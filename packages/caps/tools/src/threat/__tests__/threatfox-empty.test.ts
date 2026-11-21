import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchThreatfoxLookupEffect } from "../threatfox";

describe("threatfox empty query", () => {
  it.effect("fails an empty query before any request", () =>
    Effect.gen(function* emptyGen() {
      const fetch = vi.fn();
      vi.stubGlobal("fetch", fetch);
      const outcome = yield* Effect.result(
        fetchThreatfoxLookupEffect("   ", "key", AbortSignal.timeout(5000), {
          userAgent: "watchdog-test",
        })
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
      expect(fetch).not.toHaveBeenCalled();
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
