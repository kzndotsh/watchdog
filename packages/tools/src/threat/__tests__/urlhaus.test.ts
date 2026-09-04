import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchUrlhausLookupEffect,
  urlhausLookupSnapshotSchema,
} from "../urlhaus";

describe("urlhaus", () => {
  it.effect("fetchUrlhausLookupEffect maps host threat metadata", () =>
    Effect.gen(function* fetchUrlhausLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              query_status: "ok",
              urls: [
                {
                  threat: "malware_download",
                  url_status: "online",
                  tags: ["emotet"],
                  urlhaus_reference: "https://urlhaus.abuse.ch/host/1/",
                },
              ],
              firstseen: "2026-01-01",
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchUrlhausLookupEffect(
        "evil.example",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(urlhausLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.threat).toBe("malware_download");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
