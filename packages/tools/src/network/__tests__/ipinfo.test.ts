import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchIpinfoLookupEffect, ipinfoLookupSnapshotSchema } from "../ipinfo";

describe("ipinfo", () => {
  it.effect("fetchIpinfoLookupEffect maps JSON fields", () =>
    Effect.gen(function* fetchIpinfoLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              city: "Mountain View",
              region: "California",
              country: "US",
              org: "AS15169 Google LLC",
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchIpinfoLookupEffect(
        "8.8.8.8",
        "token",
        AbortSignal.timeout(5000)
      );

      expect(ipinfoLookupSnapshotSchema.parse(snap).city).toBe("Mountain View");
      expect(snap.org).toContain("Google");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
