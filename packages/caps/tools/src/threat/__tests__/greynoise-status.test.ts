import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { HttpVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchGreynoiseCommunityEffect } from "../greynoise";

describe("greynoise statuses", () => {
  it.effect("fails a 2xx other than 200 as an HTTP error", () =>
    Effect.gen(function* nonOkGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response("{}", { status: 202 }))
      );
      const outcome = yield* Effect.result(
        fetchGreynoiseCommunityEffect("8.8.8.8", AbortSignal.timeout(5000), {
          userAgent: "watchdog-test",
        })
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(HttpVendorError);
      }
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
