import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";

import {
  MissingCredentialError,
  ValidationVendorError,
} from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchEmailrepLookupEffect } from "../emailrep";

describe("emailrep", () => {
  it.effect("fetchEmailrepLookupEffect requires EMAILREP_API_KEY", () =>
    Effect.gen(function* missingKeyGen() {
      const result = yield* fetchEmailrepLookupEffect(
        "ada@example.com",
        AbortSignal.timeout(5000)
      ).pipe(Effect.flip);

      expect(result).toBeInstanceOf(MissingCredentialError);
      expect(result.slot).toBe("EMAILREP_API_KEY");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

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
