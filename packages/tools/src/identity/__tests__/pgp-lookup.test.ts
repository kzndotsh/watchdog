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
      "pub:404B72211DBE155213A5FE7F503DFDD1:1:1024:1104505339:::",
      "uid:Alice <alice@mailhost.test>",
    ].join("\n");
    const keys = parseHkpMrIndex(body);
    expect(keys[0]?.fingerprint).toBe("404B72211DBE155213A5FE7F503DFDD1");
    expect(keys[0]?.created).toBe(new Date(1_104_505_339 * 1000).toISOString());
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
                "pub:404B72211DBE155213A5FE7F503DFDD1:1:1024:1104505339:::\nuid:Alice",
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
