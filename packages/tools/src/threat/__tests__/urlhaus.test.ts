import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchUrlhausLookupEffect,
  urlhausLookupSnapshotSchema,
} from "../urlhaus";

describe("urlhaus", () => {
  it.effect("fetchUrlhausLookupEffect maps host threat metadata", () =>
    Effect.gen(function* fetchUrlhausLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              query_status: "ok",
              urls: [
                {
                  threat: "malware_download",
                  url_status: "online",
                  tags: ["emotet"],
                  urlhaus_reference: "https://urlhaus.abuse.ch/host/1/",
                },
              ],
              firstseen: "2026-01-01",
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchUrlhausLookupEffect(
        "evil.example",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(urlhausLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.threat).toBe("malware_download");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect(
    "fetchUrlhausLookupEffect treats ok hash payloads without metadata as not found",
    () =>
      Effect.gen(function* fetchUrlhausHashEmptyGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                query_status: "ok",
              }),
              { status: 200 }
            )
          )
        );

        const hash = "a".repeat(64);
        const snap = yield* fetchUrlhausLookupEffect(
          hash,
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(snap.kind).toBe("hash");
        expect(snap.found).toBe(false);
        expect(snap.threat).toBeNull();
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );

  it.effect(
    "fetchUrlhausLookupEffect treats ok url payloads without metadata as not found",
    () =>
      Effect.gen(function* fetchUrlhausUrlEmptyGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                query_status: "ok",
              }),
              { status: 200 }
            )
          )
        );

        const snap = yield* fetchUrlhausLookupEffect(
          "https://evil.example/malware.exe",
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(snap.kind).toBe("url");
        expect(snap.found).toBe(false);
        expect(snap.threat).toBeNull();
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );

  it.effect(
    "fetchUrlhausLookupEffect treats ok host rows without metadata as not found",
    () =>
      Effect.gen(function* fetchUrlhausHostEmptyGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                query_status: "ok",
                urls: [{}],
              }),
              { status: 200 }
            )
          )
        );

        const snap = yield* fetchUrlhausLookupEffect(
          "evil.example",
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(snap.kind).toBe("host");
        expect(snap.found).toBe(false);
        expect(snap.threat).toBeNull();
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );

  it.effect("fetchUrlhausLookupEffect rejects invalid host queries", () =>
    Effect.gen(function* fetchUrlhausInvalidHostGen() {
      const outcome = yield* Effect.result(
        fetchUrlhausLookupEffect(
          "not a host!",
          "test-key",
          AbortSignal.timeout(5000)
        )
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure._tag).toBe("ValidationVendorError");
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );
});
