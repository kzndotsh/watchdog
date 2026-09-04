import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchHibpBreachedAccountEffect,
  hibpLookupSnapshotSchema,
} from "../hibp";

describe("hibp", () => {
  it("parses empty breach snapshots", () => {
    const snap = hibpLookupSnapshotSchema.parse({
      email: "alice@mailhost.test",
      queriedAt: "2026-01-01T00:00:00.000Z",
      found: false,
      breachCount: 0,
      breaches: [],
      status: 404,
    });
    expect(snap.found).toBe(false);
  });

  it.effect(
    "fetchHibpBreachedAccountEffect treats HTTP 404 as no breaches",
    () =>
      Effect.gen(function* fetchHibpBreachedAccountGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
        );

        const snap = yield* fetchHibpBreachedAccountEffect(
          "alice@mailhost.test",
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(snap.found).toBe(false);
        expect(snap.breachCount).toBe(0);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );
});
