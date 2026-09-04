import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchSnusbaseLookupEffect,
  snusbaseLookupSnapshotSchema,
} from "../snusbase";

describe("snusbase", () => {
  it("parses lookup snapshot schema", () => {
    const snap = snusbaseLookupSnapshotSchema.parse({
      query: "alice@mailhost.test",
      kind: "email",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "api.snusbase.com",
      found: false,
      total: 0,
      tables: [],
      sampleCount: 0,
      entries: [],
    });
    expect(snap.kind).toBe("email");
  });

  it.effect("fetchSnusbaseLookupEffect flattens table results", () =>
    Effect.gen(function* fetchSnusbaseLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              size: 1,
              results: {
                ExampleTable: [
                  {
                    email: "alice@mailhost.test",
                    username: "alice",
                  },
                ],
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchSnusbaseLookupEffect(
        "alice@mailhost.test",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(true);
      expect(snap.entries[0]?.email).toBe("alice@mailhost.test");
      expect(snap.tables[0]?.name).toBe("ExampleTable");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
