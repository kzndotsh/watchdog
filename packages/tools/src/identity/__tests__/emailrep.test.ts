import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchEmailrepLookupEffect } from "../emailrep";

describe("emailrep", () => {
  it.effect("fetchEmailrepLookupEffect rejects invalid emails", () =>
    Effect.gen(function* rejectInvalidEmailGen() {
      const outcome = yield* Effect.result(
        fetchEmailrepLookupEffect("not-an-email", AbortSignal.timeout(5000))
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
