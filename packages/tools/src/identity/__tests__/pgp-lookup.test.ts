import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  fetchPgpLookupEffect,
  parseHkpMrIndex,
  pgpLookupSnapshotSchema,
} from "../pgp-lookup";

describe("pgp-lookup", () => {
  it("parseHkpMrIndex reads pub and uid lines", () => {
    const body = [
      "pub:2048:22:ABCDEF0123456789:DEADBEEF:1609459200:0:",
      "uid:Alice <alice@mailhost.test>",
    ].join("\n");
    const keys = parseHkpMrIndex(body);
    expect(keys[0]?.fingerprint).toBe("DEADBEEF");
    expect(keys[0]?.uids[0]).toContain("alice@mailhost.test");
  });

  it.effect(
    "fetchPgpLookupEffect returns keys from the first successful keyserver",
    () =>
      Effect.gen(function* fetchPgpLookupGen() {
        vi.stubGlobal(
          "fetch",
          vi
            .fn()
            .mockResolvedValue(
              new Response(
                "pub:2048:22:ABCDEF0123456789:DEADBEEF:1609459200:0:\nuid:Alice",
                { status: 200 }
              )
            )
        );

        const snap = yield* fetchPgpLookupEffect(
          "alice@mailhost.test",
          AbortSignal.timeout(5000)
        );

        expect(pgpLookupSnapshotSchema.parse(snap).keys).toHaveLength(1);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );
});
