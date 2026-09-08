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
      expect(snap.found).toBe(true);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("treats explicit bogon:false as found", () =>
    Effect.gen(function* ipinfoBogonFalseGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              ip: "8.8.8.8",
              bogon: false,
              city: "Mountain View",
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

      expect(snap.found).toBe(true);
      expect(snap.city).toBe("Mountain View");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("treats bogon:true as not found", () =>
    Effect.gen(function* ipinfoBogonTrueGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ ip: "127.0.0.1", bogon: true }), {
            status: 200,
          })
        )
      );

      const snap = yield* fetchIpinfoLookupEffect(
        "127.0.0.1",
        "token",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
