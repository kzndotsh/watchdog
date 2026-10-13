import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

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
      expect(result).toMatchObject({ slot: "EMAILREP_API_KEY" });
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

  it.effect(
    "a rejected key keeps the HTTP status, not the email, in the cause",
    () =>
      Effect.gen(function* rejectedKeyGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(new Response("{}", { status: 401 }))
        );
        const failure = yield* fetchEmailrepLookupEffect(
          "ada@example.com",
          AbortSignal.timeout(5000),
          { apiKey: "k" }
        ).pipe(Effect.flip);
        expect(failure).toBeInstanceOf(ValidationVendorError);
        expect(failure.message).toBe("EmailRep API key invalid");
        expect(String(failure.cause)).toContain("401");
        expect(String(failure.cause)).not.toContain("ada@example.com");
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );
});
