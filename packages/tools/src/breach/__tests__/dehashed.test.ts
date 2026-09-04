import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  dehashedEntrySchema,
  dehashedLookupSnapshotSchema,
  fetchDehashedLookupEffect,
} from "../dehashed";

describe("dehashed", () => {
  it("parses entry and snapshot schemas", () => {
    const entry = dehashedEntrySchema.parse({
      databaseName: "ExampleDump",
      email: "alice@mailhost.test",
      username: null,
      ipAddress: null,
      name: null,
      phone: null,
      password: null,
      hashedPassword: null,
    });
    expect(entry.email).toBe("alice@mailhost.test");

    const snap = dehashedLookupSnapshotSchema.parse({
      query: "alice@mailhost.test",
      kind: "email",
      queriedAt: "2026-01-01T00:00:00.000Z",
      source: "api.dehashed.com",
      found: false,
      total: 0,
      balance: null,
      databases: [],
      sampleCount: 0,
      entries: [],
    });
    expect(snap.found).toBe(false);
  });

  it.effect("fetchDehashedLookupEffect maps API hits for email queries", () =>
    Effect.gen(function* fetchDehashedLookupGen() {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              entries: [
                {
                  database_name: "ExampleDump",
                  email: "alice@mailhost.test",
                },
              ],
              total: 1,
              balance: 10,
            }),
            { status: 200 }
          )
        )
      );

      const snap = yield* fetchDehashedLookupEffect(
        "alice@mailhost.test",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(snap.kind).toBe("email");
      expect(snap.found).toBe(true);
      expect(snap.entries[0]?.email).toBe("alice@mailhost.test");
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
