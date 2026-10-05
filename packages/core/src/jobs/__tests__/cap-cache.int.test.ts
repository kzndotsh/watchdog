import { Effect } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomain } from "@watchdog/core/infra";
import { db } from "@watchdog/db";
import { resetTestDb, seedCase } from "@watchdog/test-db";

import { lookupCapCacheEffect, storeCapCacheEffect } from "../cap-cache.ts";

describe("storeCapCacheEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("trims padded resultSummary before upsert", async () => {
    const cased = await seedCase(db);
    const jobId = "11111111-1111-4111-8111-000000000088";
    await runDomain(
      storeCapCacheEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-summary",
        jobId,
        artifacts: [],
        resultSummary: "  trimmed summary  ",
        ttlMs: 60_000,
      })
    );

    const hit = await runDomain(
      lookupCapCacheEffect({
        caseId: cased.id,
        capabilityId: "network.dns.lookup",
        inputHash: "hash-summary",
      })
    );
    expect(hit?.resultSummary).toBe("trimmed summary");
  });

  it("expires entries by the Effect clock, not the wall clock", async () => {
    const cased = await seedCase(db);
    const key = {
      caseId: cased.id,
      capabilityId: "network.dns.lookup",
      inputHash: "hash-clock",
    };
    const ttlMs = 60_000;
    const start = Date.UTC(2031, 0, 1);

    const outcome = await Effect.runPromise(
      Effect.gen(function* cacheClockGen() {
        yield* TestClock.setTime(start);
        yield* storeCapCacheEffect({
          ...key,
          jobId: "11111111-1111-4111-8111-000000000089",
          artifacts: [],
          resultSummary: null,
          ttlMs,
        });
        yield* TestClock.setTime(start + ttlMs - 1);
        const fresh = yield* lookupCapCacheEffect(key);
        yield* TestClock.setTime(start + ttlMs + 1);
        const stale = yield* lookupCapCacheEffect(key);
        return { fresh, stale };
      }).pipe(Effect.provide(Db.layer), Effect.provide(TestClock.layer()))
    );

    // The wall clock (2026) is before every stored expiry: only the Effect clock can expire it.
    expect(outcome.fresh).not.toBeNull();
    expect(outcome.stale).toBeNull();
  });
});
