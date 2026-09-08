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

  it.effect("fetchGreynoiseCommunityEffect treats clean 200 as found", () =>
    Effect.gen(function* fetchGreynoiseCleanGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ip: "8.8.8.8",
              noise: false,
              riot: false,
              message: "Success",
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchGreynoiseCommunityEffect(
        "8.8.8.8",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(true);
      expect(snap.noise).toBe(false);
      expect(snap.riot).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchGreynoiseCommunityEffect treats 404 as not found", () =>
    Effect.gen(function* fetchGreynoiseNotFoundGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ message: "IP not found" }), {
            status: 404,
          })
        )
      );

      const snap = yield* fetchGreynoiseCommunityEffect(
        "203.0.113.1",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
