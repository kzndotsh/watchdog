import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  submitUrlscanEffect,
  urlscanSubmitSnapshotSchema,
} from "../urlscan-submit";

describe("urlscan-submit", () => {
  it.effect("submitUrlscanEffect maps accepted scan submissions", () =>
    Effect.gen(function* submitUrlscanGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              uuid: "scan-uuid",
              result: "https://urlscan.io/result/scan-uuid/",
              api: "https://urlscan.io/api/v1/result/scan-uuid/",
              message: "Submission successful",
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* submitUrlscanEffect(
        "https://example.com",
        "test-key",
        "unlisted",
        AbortSignal.timeout(5000)
      );

      expect(urlscanSubmitSnapshotSchema.parse(snap).accepted).toBe(true);
      expect(snap.uuid).toBe("scan-uuid");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
