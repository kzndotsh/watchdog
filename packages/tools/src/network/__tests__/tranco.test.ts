import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchTrancoLookupEffect, trancoLookupSnapshotSchema } from "../tranco";

describe("tranco", () => {
  it.effect("fetchTrancoLookupEffect maps rank history", () =>
    Effect.gen(function* fetchTrancoLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ranks: [{ date: "2026-01-01", rank: 42 }],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchTrancoLookupEffect(
        "example.com",
        AbortSignal.timeout(5000)
      );

      expect(trancoLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.latestRank).toBe(42);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
