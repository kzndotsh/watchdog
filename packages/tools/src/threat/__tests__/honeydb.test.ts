import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchHoneydbLookupEffect,
  honeydbLookupSnapshotSchema,
} from "../honeydb";

describe("honeydb", () => {
  it.effect("fetchHoneydbLookupEffect maps ip-context payloads", () =>
    Effect.gen(function* fetchHoneydbLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              network_info: { asn: 15_169, country: "US" },
              threat_info: { is_tor: false, is_threat: true },
              internet_scanner: false,
              ip_history: [{ event_count: 2 }],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchHoneydbLookupEffect(
        "8.8.8.8",
        "id",
        "key",
        AbortSignal.timeout(5000)
      );

      expect(honeydbLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.historyEventCount).toBe(2);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
