import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
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

  it.effect("fetchHibpBreachedAccountEffect rejects invalid emails", () =>
    Effect.gen(function* rejectInvalidEmailGen() {
      const outcome = yield* Effect.result(
        fetchHibpBreachedAccountEffect(
          "not-an-email",
          "test-key",
          AbortSignal.timeout(5000)
        )
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

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

  it.effect(
    "fetchHibpBreachedAccountEffect aligns breachCount with parsed breaches",
    () =>
      Effect.gen(function* fetchHibpBreachedAccountCountGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify([
                {
                  Name: "BreachA",
                  Title: "Breach A",
                  Domain: "mailhost.test",
                  BreachDate: "2020-01-01",
                  PwnCount: 1,
                  DataClasses: ["Email addresses"],
                },
                "not-an-object",
              ]),
              { status: 200 }
            )
          )
        );

        const snap = yield* fetchHibpBreachedAccountEffect(
          "alice@mailhost.test",
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(snap.found).toBe(true);
        expect(snap.breachCount).toBe(1);
        expect(snap.breaches).toHaveLength(1);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );
});
