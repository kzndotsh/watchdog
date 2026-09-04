import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { censysLookupSnapshotSchema, fetchCensysHostEffect } from "../censys";

describe("censys", () => {
  it("parses empty host snapshots", () => {
    const snap = censysLookupSnapshotSchema.parse({
      ip: "8.8.8.8",
      queriedAt: "2026-01-01T00:00:00.000Z",
      found: false,
      status: 404,
      asn: null,
      asName: null,
      asCountryCode: null,
      countryCode: null,
      city: null,
      ports: [],
      serviceNames: [],
      hostnames: [],
    });
    expect(snap.found).toBe(false);
  });

  it.effect("fetchCensysHostEffect maps HTTP 404 to found=false", () =>
    Effect.gen(function* fetchCensysHostGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchCensysHostEffect(
        "8.8.8.8",
        "id",
        "secret",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
