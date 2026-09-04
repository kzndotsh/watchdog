import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchOtxLookupEffect, otxLookupSnapshotSchema } from "../otx";

describe("otx", () => {
  it.effect("fetchOtxLookupEffect maps pulse summaries", () =>
    Effect.gen(function* fetchOtxLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              pulse_info: {
                count: 1,
                pulses: [
                  { name: "Example Pulse", malware_families: ["Emotet"] },
                ],
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchOtxLookupEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(otxLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.pulseCount).toBe(1);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
