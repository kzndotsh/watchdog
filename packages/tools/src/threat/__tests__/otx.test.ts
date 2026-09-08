import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import { fetchOtxLookupEffect, otxLookupSnapshotSchema } from "../otx";

describe("otx", () => {
  it.effect("rejects javascript URL schemes", () =>
    Effect.gen(function* rejectJavascriptSchemeGen() {
      const badUrl = ["javascript", ":alert(1)"].join("");
      const outcome = yield* Effect.result(
        fetchOtxLookupEffect(badUrl, "test-key", new AbortController().signal)
      );

      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("fetchOtxLookupEffect maps pulse summaries", () =>
    Effect.gen(function* fetchOtxLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              pulse_info: {
                count: 1,
                pulses: [
                  { name: "Example Pulse", malware_families: ["Emotet"] },
                ],
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchOtxLookupEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(otxLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.pulseCount).toBe(1);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchOtxLookupEffect treats zero pulses as found", () =>
    Effect.gen(function* fetchOtxZeroPulsesGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              pulse_info: {
                count: 0,
                pulses: [],
              },
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchOtxLookupEffect(
        "8.8.8.8",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(true);
      expect(snap.pulseCount).toBe(0);
      expect(snap.pulseNames).toEqual([]);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect(
    "fetchOtxLookupEffect uses IPv6 indicator type for v6 addresses",
    () =>
      Effect.gen(function* fetchOtxIpv6Gen() {
        const fetchMock = vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              pulse_info: { count: 0, pulses: [] },
            }),
            { status: 200 }
          )
        );
        vi.stubGlobal("fetch", fetchMock);

        yield* fetchOtxLookupEffect(
          "2001:db8::1",
          "test-key",
          AbortSignal.timeout(5000)
        );

        expect(
          fetchMock.mock.calls.some((call) =>
            String(call[0]).includes("/indicators/IPv6/")
          )
        ).toBe(true);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );
});
