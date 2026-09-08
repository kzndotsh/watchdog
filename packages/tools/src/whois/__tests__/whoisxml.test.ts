import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { MissingCredentialError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchWhoisXmlEffect } from "../whoisxml";

describe("whoisxml", () => {
  it.effect("fetchWhoisXmlEffect maps WhoisXML JSON payloads", () =>
    Effect.gen(function* fetchWhoisXmlGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              WhoisRecord: {
                registrarName: "Example Registrar",
                createdDate: "2000-01-01",
                nameServers: { hostNames: ["ns1.example.com"] },
                status: "ok",
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchWhoisXmlEffect(
        "example.com",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.source).toBe("whoisxml");
      expect(snap.registrar).toBe("Example Registrar");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchWhoisXmlEffect rejects an empty API key", () =>
    Effect.gen(function* fetchWhoisXmlMissingKeyGen() {
      const outcome = yield* Effect.result(
        fetchWhoisXmlEffect("example.com", "  ", AbortSignal.timeout(5000))
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(MissingCredentialError);
        expect(outcome.failure.slot).toBe("WHOIS_API_KEY");
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
