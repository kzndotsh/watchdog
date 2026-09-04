import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchUrlscanSearchEffect,
  urlscanLookupSnapshotSchema,
} from "../urlscan";

describe("urlscan search", () => {
  it.effect("fetchUrlscanSearchEffect maps search hits", () =>
    Effect.gen(function* fetchUrlscanSearchGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              total: 1,
              results: [
                {
                  task: {
                    uuid: "scan-1",
                    url: "https://example.com/",
                    time: "2026-01-01T00:00:00.000Z",
                  },
                  page: {
                    domain: "example.com",
                    ip: "93.184.216.34",
                    url: "https://example.com/",
                  },
                  result: "https://urlscan.io/result/scan-1/",
                },
              ],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchUrlscanSearchEffect(
        "example.com",
        AbortSignal.timeout(5000)
      );

      expect(urlscanLookupSnapshotSchema.parse(snap).hits).toHaveLength(1);
      expect(snap.urls).toContain("https://example.com/");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
