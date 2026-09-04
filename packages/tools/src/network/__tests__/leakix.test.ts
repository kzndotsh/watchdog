import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchLeakixLookupEffect, leakixLookupSnapshotSchema } from "../leakix";

describe("leakix", () => {
  it("parses empty lookup snapshots", () => {
    const snap = leakixLookupSnapshotSchema.parse({
      query: "8.8.8.8",
      kind: "ip",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "leakix.net",
      found: false,
      serviceCount: 0,
      leakCount: 0,
      protocols: [],
      hostnames: [],
    });
    expect(snap.found).toBe(false);
  });

  it.effect("fetchLeakixLookupEffect treats HTTP 404 as no exposure", () =>
    Effect.gen(function* fetchLeakixLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchLeakixLookupEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
