import { describe, expect, it } from "@effect/vitest";
import { Effect, Result } from "effect";
import { vi } from "vitest";

import { ValidationVendorError } from "../../errors/tagged-errors";
import { toolsHttpClientLayer } from "../../http/http-client-layer";
import {
  dehashedEntrySchema,
  dehashedLookupSnapshotSchema,
  fetchDehashedLookupEffect,
} from "../dehashed";

function postBodyQuery(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex = 0
): string {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  const raw = init?.body;
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (raw instanceof Uint8Array) {
    text = new TextDecoder().decode(raw);
  }
  return (JSON.parse(text) as { query: string }).query;
}

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

  it.effect(
    "fetchDehashedLookupEffect drops empty entry rows from the sample",
    () =>
      Effect.gen(function* fetchDehashedEmptyEntryGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                entries: [
                  {},
                  { database_name: "Dump", email: "alice@mailhost.test" },
                ],
                total: 2,
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

        expect(snap.sampleCount).toBe(1);
        expect(snap.entries).toHaveLength(1);
        expect(snap.entries[0]?.email).toBe("alice@mailhost.test");
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );

  it.effect(
    "fetchDehashedLookupEffect reports not found when every row lacks substance",
    () =>
      Effect.gen(function* fetchDehashedNoSubstanceGen() {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue(
            new Response(
              JSON.stringify({
                entries: [{}],
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

        expect(snap.found).toBe(false);
        expect(snap.total).toBe(1);
        expect(snap.sampleCount).toBe(0);
      }).pipe(
        Effect.provide(toolsHttpClientLayer),
        Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
      )
  );

  it.effect("fetchDehashedLookupEffect quotes domain values", () =>
    Effect.gen(function* fetchDehashedDomainQueryGen() {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entries: [],
            total: 0,
            balance: 10,
          }),
          { status: 200 }
        )
      );
      vi.stubGlobal("fetch", fetchMock);

      yield* fetchDehashedLookupEffect(
        "mailhost.test",
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(postBodyQuery(fetchMock, 0)).toBe('domain:"mailhost.test"');
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchDehashedLookupEffect quotes username values", () =>
    Effect.gen(function* fetchDehashedUsernameQueryGen() {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            entries: [],
            total: 0,
            balance: 10,
          }),
          { status: 200 }
        )
      );
      vi.stubGlobal("fetch", fetchMock);

      const username = "a".repeat(64);
      yield* fetchDehashedLookupEffect(
        username,
        "test-key",
        AbortSignal.timeout(5000)
      );

      expect(postBodyQuery(fetchMock, 0)).toBe(`username:"${username}"`);
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );

  it.effect("fetchDehashedLookupEffect rejects free-form query injection", () =>
    Effect.gen(function* fetchDehashedRejectQueryGen() {
      const outcome = yield* Effect.result(
        fetchDehashedLookupEffect(
          "example.com) OR email:admin",
          "test-key",
          AbortSignal.timeout(5000)
        )
      );
      expect(Result.isFailure(outcome)).toBe(true);
      if (Result.isFailure(outcome)) {
        expect(outcome.failure).toBeInstanceOf(ValidationVendorError);
      }
    }).pipe(
      Effect.provide(toolsHttpClientLayer),
      Effect.ensuring(Effect.sync(() => vi.unstubAllGlobals()))
    )
  );
});
