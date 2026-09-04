import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchVirusTotalLookupEffect,
  virusTotalLookupSnapshotSchema,
} from "../virustotal";

describe("virustotal", () => {
  it.effect("fetchVirusTotalLookupEffect maps HTTP 404 to found=false", () =>
    Effect.gen(function* fetchVirusTotalLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchVirusTotalLookupEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(virusTotalLookupSnapshotSchema.parse(snap).found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
