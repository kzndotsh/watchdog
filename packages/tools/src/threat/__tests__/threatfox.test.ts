import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchThreatfoxLookupEffect,
  threatfoxLookupSnapshotSchema,
} from "../threatfox";

describe("threatfox", () => {
  it.effect("fetchThreatfoxLookupEffect maps IOC search results", () =>
    Effect.gen(function* fetchThreatfoxLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              query_status: "ok",
              data: [
                {
                  id: "1",
                  ioc: "8.8.8.8",
                  threat_type: "botnet_cc",
                  malware: "emotet",
                  tags: ["emotet"],
                },
              ],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchThreatfoxLookupEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(threatfoxLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.iocs[0]?.ioc).toBe("8.8.8.8");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect(
    "fetchThreatfoxLookupEffect treats ok with empty data as found",
    () =>
      Effect.gen(function* fetchThreatfoxEmptyGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                query_status: "ok",
                data: [],
              }),
              { status: 200 }
            )
          )
        );

        const snap = yield* fetchThreatfoxLookupEffect(
          "8.8.8.8",
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(snap.found).toBe(true);
        expect(snap.queryStatus).toBe("ok");
        expect(snap.iocs).toEqual([]);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );
});
