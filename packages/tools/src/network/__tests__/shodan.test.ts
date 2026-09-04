import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchShodanHostEffect, shodanLookupSnapshotSchema } from "../shodan";

describe("shodan", () => {
  it.effect("fetchShodanHostEffect maps HTTP 404 to found=false", () =>
    Effect.gen(function* fetchShodanHostGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchShodanHostEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(shodanLookupSnapshotSchema.parse(snap).found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
