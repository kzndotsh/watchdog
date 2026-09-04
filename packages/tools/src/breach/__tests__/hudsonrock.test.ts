import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchHudsonrockLookupEffect,
  hudsonrockLookupSnapshotSchema,
} from "../hudsonrock";

describe("hudsonrock", () => {
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
});
