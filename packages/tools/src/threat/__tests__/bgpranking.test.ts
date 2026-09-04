import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  bgprankingLookupSnapshotSchema,
  fetchBgprankingLookupEffect,
} from "../bgpranking";

describe("bgpranking", () => {
  it.effect("fetchBgprankingLookupEffect maps ASN ranking data", () =>
    Effect.gen(function* fetchBgprankingLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                response: { "2026-01-01": { asn: 15_169 } },
              }),
              { status: 200 }
            )
          )
          .mockResolvedValueOnce(
            new Response(
              JSON.stringify({
                response: {
                  asn_description: "GOOGLE",
                  ranking: { rank: 1.23, position: 5 },
                },
              }),
              { status: 200 }
            )
          )
      );

      const snap = yield* fetchBgprankingLookupEffect(
        "8.8.8.8",
        AbortSignal.timeout(5000)
      );

      expect(bgprankingLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.asn).toBe(15_169);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
