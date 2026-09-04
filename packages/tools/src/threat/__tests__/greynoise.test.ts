import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchGreynoiseCommunityEffect,
  greynoiseLookupSnapshotSchema,
} from "../greynoise";

describe("greynoise", () => {
  it.effect("fetchGreynoiseCommunityEffect maps community responses", () =>
    Effect.gen(function* fetchGreynoiseCommunityGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ip: "8.8.8.8",
              noise: false,
              riot: true,
              classification: "benign",
              name: "Google Public DNS",
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchGreynoiseCommunityEffect(
        "8.8.8.8",
        AbortSignal.timeout(5000)
      );

      expect(greynoiseLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.riot).toBe(true);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
