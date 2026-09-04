import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchSafebrowsingLookupEffect,
  safebrowsingLookupSnapshotSchema,
} from "../safebrowsing";

describe("safebrowsing", () => {
  it.effect("fetchSafebrowsingLookupEffect maps empty threat matches", () =>
    Effect.gen(function* fetchSafebrowsingLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
      );

      const snap = yield* fetchSafebrowsingLookupEffect(
        "https://example.com",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(safebrowsingLookupSnapshotSchema.parse(snap).found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
