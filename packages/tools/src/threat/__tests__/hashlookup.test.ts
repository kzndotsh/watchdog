import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchHashlookupEffect, hashlookupSnapshotSchema } from "../hashlookup";

describe("hashlookup", () => {
  it.effect("fetchHashlookupEffect maps known-file metadata", () =>
    Effect.gen(function* fetchHashlookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              FileName: "eicar.com",
              "SHA-256": "a".repeat(64),
              "hashlookup:trust": 80,
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchHashlookupEffect(
        "44d88612fea8a8f36de82e1278abb02f",
        AbortSignal.timeout(5000)
      );

      expect(hashlookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.fileName).toBe("eicar.com");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchHashlookupEffect treats empty 200 bodies as not found", () =>
    Effect.gen(function* fetchHashlookupEmptyGen() {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
      );

      const snap = yield* fetchHashlookupEffect(
        "44d88612fea8a8f36de82e1278abb02f",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(false);
      expect(snap.fileName).toBeNull();
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
