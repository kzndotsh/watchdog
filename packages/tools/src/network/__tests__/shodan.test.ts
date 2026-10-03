import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { TestClock } from "effect/testing";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchShodanHostEffect, shodanLookupSnapshotSchema } from "../shodan";

describe("shodan", () => {
  it.effect("fetchShodanHostEffect maps HTTP 404 to found=false", () =>
    Effect.gen(function* fetchShodanHostGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
      );

      const snap = yield* fetchShodanHostEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(shodanLookupSnapshotSchema.parse(snap).found).toBe(false);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  const stubBody = (body: unknown) =>
    Effect.sync(() =>
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
        )
      )
    );

  it.effect("stamps a found snapshot from the injected clock", () =>
    Effect.gen(function* clockGen() {
      yield* TestClock.setTime(Date.parse("2020-02-03T04:05:06.000Z"));
      yield* stubBody({ org: "Example", ports: [443] });

      const snap = yield* fetchShodanHostEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(true);
      expect(snap.queriedAt).toBe("2020-02-03T04:05:06.000Z");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fails with a typed ParseVendorError on a malformed body", () =>
    Effect.gen(function* malformedGen() {
      yield* stubBody({ org: 42, ports: "nope" });

      const result = yield* Effect.result(
        fetchShodanHostEffect("8.8.8.8", "test-key", AbortSignal.timeout(5000))
      );

      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result)) {
        expect(result.failure._tag).toBe("ParseVendorError");
      }
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
