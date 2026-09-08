import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchSafebrowsingLookupEffect,
  safebrowsingLookupSnapshotSchema,
} from "../safebrowsing";

describe("safebrowsing", () => {
  it.effect("rejects non-http(s) URL queries", () =>
    Effect.gen(function* rejectBadSchemeGen() {
      const outcome = yield* Effect.result(
        fetchSafebrowsingLookupEffect(
          "file:///etc/passwd",
          "test-key",
          AbortSignal.timeout(5000)
        )
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("fetchSafebrowsingLookupEffect maps empty threat matches", () =>
    Effect.gen(function* fetchSafebrowsingLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
      );

      const snap = yield* fetchSafebrowsingLookupEffect(
        "https://example.com",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(safebrowsingLookupSnapshotSchema.parse(snap).found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
