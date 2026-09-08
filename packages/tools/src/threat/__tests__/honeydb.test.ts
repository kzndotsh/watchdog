import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { MissingCredentialError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchHoneydbLookupEffect,
  honeydbLookupSnapshotSchema,
} from "../honeydb";

describe("honeydb", () => {
  it.effect("fetchHoneydbLookupEffect requires HONEYDB_API_ID", () =>
    Effect.gen(function* missingIdGen() {
      const result = yield* fetchHoneydbLookupEffect(
        "8.8.8.8",
        "   ",
        "key",
        AbortSignal.timeout(5000)
      ).pipe(Effect.flip);

      expect(result).toBeInstanceOf(MissingCredentialError);
      expect(result.slot).toBe("HONEYDB_API_ID");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("fetchHoneydbLookupEffect requires HONEYDB_API_KEY", () =>
    Effect.gen(function* missingKeyGen() {
      const result = yield* fetchHoneydbLookupEffect(
        "8.8.8.8",
        "id",
        "   ",
        AbortSignal.timeout(5000)
      ).pipe(Effect.flip);

      expect(result).toBeInstanceOf(MissingCredentialError);
      expect(result.slot).toBe("HONEYDB_API_KEY");
    }).pipe(Effect.provide(toolsHttpClientLayer))
  );

  it.effect("fetchHoneydbLookupEffect maps ip-context payloads", () =>
    Effect.gen(function* fetchHoneydbLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              network_info: { asn: 15_169, country: "US" },
              threat_info: { is_tor: false, is_threat: true },
              internet_scanner: false,
              ip_history: [{ event_count: 2 }],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchHoneydbLookupEffect(
        "8.8.8.8",
        "id",
        "key",
        AbortSignal.timeout(5000)
      );

      expect(honeydbLookupSnapshotSchema.parse(snap).found).toBe(true);
      expect(snap.historyEventCount).toBe(2);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect(
    "fetchHoneydbLookupEffect treats clean 200 responses as found",
    () =>
      Effect.gen(function* fetchHoneydbLookupCleanGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                network_info: { asn: 15_169, country: "US" },
                threat_info: { is_tor: false, is_threat: false },
                internet_scanner: false,
                ip_history: [],
              }),
              { status: 200 }
            )
          )
        );

        const snap = yield* fetchHoneydbLookupEffect(
          "8.8.8.8",
          "id",
          "key",
          AbortSignal.timeout(5000)
        );

        expect(snap.found).toBe(true);
        expect(snap.isThreat).toBe(false);
        expect(snap.historyEventCount).toBe(0);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );

  it.effect("fetchHoneydbLookupEffect treats Tor-only context as found", () =>
    Effect.gen(function* fetchHoneydbLookupTorGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              network_info: { asn: 20_000, country: "DE" },
              threat_info: { is_tor: true, is_threat: false },
              internet_scanner: false,
              ip_history: [],
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchHoneydbLookupEffect(
        "1.2.3.4",
        "id",
        "key",
        AbortSignal.timeout(5000)
      );

      expect(snap.found).toBe(true);
      expect(snap.isTor).toBe(true);
      expect(snap.isThreat).toBe(false);
      expect(snap.historyEventCount).toBe(0);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
