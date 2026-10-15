import { describe, expect, it } from "@effect/vitest";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import {
  READINESS_TIMEOUT_MS,
  readinessFrom,
  type ReadinessReport,
} from "../readiness";

/** Text a real driver puts in its errors: none of it may reach the report. */
const LEAKY =
  "connect ECONNREFUSED 10.9.8.7:5432 postgres://app:hunter2@db.internal/app";
const SECRETS = [
  "ECONNREFUSED",
  "10.9.8.7",
  "hunter2",
  "postgres://",
  "db.internal",
];

const up = Effect.void;
const failing = Effect.fail(new Error(LEAKY));
const throwing = Effect.die(new Error(LEAKY));
const slow = Effect.never;

function probes(
  database: Effect.Effect<unknown, unknown>,
  storage: Effect.Effect<unknown, unknown>
) {
  return readinessFrom({ database, storage });
}

describe("readinessFrom", () => {
  it.effect("is ready when both dependencies answer", () =>
    Effect.gen(function* bothUp() {
      const expected: ReadinessReport = {
        ok: true,
        database: "ok",
        storage: "ok",
      };
      expect(yield* probes(up, up)).toEqual(expected);
    })
  );

  it.effect("names the database when only it is down", () =>
    Effect.gen(function* dbOnly() {
      expect(yield* probes(failing, up)).toEqual({
        ok: false,
        database: "unreachable",
        storage: "ok",
      });
    })
  );

  it.effect("names storage when only it is down", () =>
    Effect.gen(function* storageOnly() {
      expect(yield* probes(up, failing)).toEqual({
        ok: false,
        database: "ok",
        storage: "unreachable",
      });
    })
  );

  it.effect("reports both down", () =>
    Effect.gen(function* bothDown() {
      expect(yield* probes(failing, failing)).toEqual({
        ok: false,
        database: "unreachable",
        storage: "unreachable",
      });
    })
  );

  it.effect(
    "treats a thrown defect as unreachable, not as a failed check",
    () =>
      Effect.gen(function* defect() {
        expect(yield* probes(throwing, up)).toEqual({
          ok: false,
          database: "unreachable",
          storage: "ok",
        });
      })
  );

  it.effect("never carries driver text, hosts or credentials", () =>
    Effect.gen(function* noLeak() {
      for (const down of [failing, throwing]) {
        const body = JSON.stringify(yield* probes(down, down));
        for (const secret of SECRETS) {
          expect(body).not.toContain(secret);
        }
      }
    })
  );

  it.effect("times a slow database out while storage still answers", () =>
    Effect.gen(function* slowDatabase() {
      const fiber = yield* Effect.forkChild(probes(slow, up));
      yield* TestClock.adjust(READINESS_TIMEOUT_MS);
      expect(yield* Fiber.join(fiber)).toEqual({
        ok: false,
        database: "timeout",
        storage: "ok",
      });
    })
  );

  it.effect("times slow storage out", () =>
    Effect.gen(function* slowStorage() {
      const fiber = yield* Effect.forkChild(probes(up, slow));
      yield* TestClock.adjust(READINESS_TIMEOUT_MS);
      expect(yield* Fiber.join(fiber)).toEqual({
        ok: false,
        database: "ok",
        storage: "timeout",
      });
    })
  );

  it.effect(
    "runs both checks in one timeout window, not one after the other",
    () =>
      Effect.gen(function* parallel() {
        const fiber = yield* Effect.forkChild(probes(slow, slow));
        yield* TestClock.adjust(READINESS_TIMEOUT_MS);
        expect(yield* Fiber.join(fiber)).toEqual({
          ok: false,
          database: "timeout",
          storage: "timeout",
        });
      })
  );

  it.effect("does not time out a check that answers inside the window", () =>
    Effect.gen(function* inWindow() {
      const fiber = yield* Effect.forkChild(
        probes(Effect.sleep(READINESS_TIMEOUT_MS - 1), up)
      );
      yield* TestClock.adjust(READINESS_TIMEOUT_MS - 1);
      expect((yield* Fiber.join(fiber)).database).toBe("ok");
    })
  );
});
