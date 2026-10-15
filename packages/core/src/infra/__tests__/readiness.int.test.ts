import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber, Layer } from "effect";
import { TestClock } from "effect/testing";

import { testDb } from "@watchdog/test-db";

import { recordingBlobStore } from "../blob-store";
import { Db } from "../db-service";
import { READINESS_TIMEOUT_MS, checkReadinessEffect } from "../readiness";

const LEAKY =
  "connect ECONNREFUSED 10.9.8.7:5432 postgres://app:hunter2@db.internal/app";

/** The real pool, except `select` (the one verb the check uses) misbehaves. */
function brokenSelect(select: () => unknown) {
  return Db.layerOf(
    new Proxy(testDb, {
      get(target, prop, receiver) {
        if (prop === "select") return select;
        return Reflect.get(target, prop, receiver) as unknown;
      },
    })
  );
}

const dbDown = brokenSelect(() => {
  throw new Error(LEAKY);
});
const dbSlow = brokenSelect(() => ({
  from: () => ({ limit: () => new Promise(() => {}) }),
}));

function store(mode: "up" | "down" | "slow") {
  return recordingBlobStore({
    respond: () => {
      if (mode === "down") throw new Error(LEAKY);
      if (mode === "slow") return new Promise(() => {});
      return {};
    },
  });
}

function check(db: Layer.Layer<Db>, mode: "up" | "down" | "slow") {
  const blobs = store(mode);
  return {
    blobs,
    effect: checkReadinessEffect.pipe(
      Effect.provide(Layer.mergeAll(db, blobs.layer))
    ),
  };
}

describe("checkReadinessEffect against the real database", () => {
  it.effect(
    "is ready with the pool answering and a store that heads its bucket",
    () =>
      Effect.gen(function* bothUp() {
        const { effect, blobs } = check(Db.layer, "up");
        expect(yield* effect).toEqual({
          ok: true,
          database: "ok",
          storage: "ok",
        });
        expect(blobs.calls.map((call) => call.command)).toEqual([
          "HeadBucketCommand",
        ]);
        expect(blobs.calls[0]?.input).toEqual({ Bucket: blobs.bucket });
      })
  );

  it.effect("reports the database down while storage is up", () =>
    Effect.gen(function* databaseDown() {
      expect(yield* check(dbDown, "up").effect).toEqual({
        ok: false,
        database: "unreachable",
        storage: "ok",
      });
    })
  );

  it.effect("reports storage down while the database is up", () =>
    Effect.gen(function* storageDown() {
      expect(yield* check(Db.layer, "down").effect).toEqual({
        ok: false,
        database: "ok",
        storage: "unreachable",
      });
    })
  );

  it.effect("reports both down without leaking the driver text", () =>
    Effect.gen(function* bothDown() {
      const report = yield* check(dbDown, "down").effect;
      expect(report).toEqual({
        ok: false,
        database: "unreachable",
        storage: "unreachable",
      });
      expect(JSON.stringify(report)).not.toMatch(/ECONNREFUSED|hunter2|10\.9/);
    })
  );

  it.effect("times out a hung database and a hung store", () =>
    Effect.gen(function* hung() {
      const fiber = yield* Effect.forkChild(check(dbSlow, "slow").effect);
      yield* TestClock.adjust(READINESS_TIMEOUT_MS);
      expect(yield* Fiber.join(fiber)).toEqual({
        ok: false,
        database: "timeout",
        storage: "timeout",
      });
    })
  );
});
