import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { MissingCredentialError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchHudsonrockLookupEffect,
  hudsonrockLookupSnapshotSchema,
} from "../hudsonrock";

describe("hudsonrock", () => {
  it.effect("fetchHudsonrockLookupEffect requires HUDSONROCK_API_KEY", () =>
    Effect.gen(function* missingKeyGen() {
      const outcome = yield* Effect.result(
        fetchHudsonrockLookupEffect(
          "alice@mailhost.test",
          "",
          AbortSignal.timeout(5000)
        )
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(MissingCredentialError);
        expect(outcome.failure.slot).toBe("HUDSONROCK_API_KEY");
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it("parses empty lookup snapshots", () => {
    const snap = hudsonrockLookupSnapshotSchema.parse({
      query: "alice@mailhost.test",
      kind: "email",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "api.hudsonrock.com",
      found: false,
      totalResults: 0,
      newestDate: null,
    });
    expect(snap.found).toBe(false);
  });

  it.effect("fetchHudsonrockLookupEffect treats HTTP 404 as no hits", () =>
    Effect.gen(function* fetchHudsonrockLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchHudsonrockLookupEffect(
        "alice@mailhost.test",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(false);
      expect(snap.totalResults).toBe(0);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchHudsonrockLookupEffect treats empty 200 as found", () =>
    Effect.gen(function* fetchHudsonrockEmptyGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ total: 0, data: [] }), {
            status: 200,
          })
        )
      );

      const snap = yield* fetchHudsonrockLookupEffect(
        "alice@mailhost.test",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(true);
      expect(snap.totalResults).toBe(0);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchHudsonrockLookupEffect rejects invalid email queries", () =>
    Effect.gen(function* fetchHudsonrockInvalidEmailGen() {
      const result = yield* Effect.exit(
        fetchHudsonrockLookupEffect(
          "not-an-email",
          "test-key",
          AbortSignal.timeout(5000)
        )
      );
      expect(result._tag).toBe("Failure");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
