import { describe, expect, it } from "@effect/vitest";
import { Effect, FiberMap } from "effect";
import { vi } from "vitest";

import {
  Db,
  JobFibers,
  makeJobQueueLayers,
  type BossDriver,
} from "@watchdog/core/worker";

import { provideWorkerLayers } from "../layers";

/**
 * The worker owns one Postgres pool (`Db.owned`, #443) and ends it last: the queue drain and the
 * `JobFibers` release both write Job status (the lifecycle module), so the pool must still be
 * open for them. This records the three releases in the order they happen.
 */
describe("worker shutdown order", () => {
  it.effect(
    "ends the pool after the queue drains and after JobFibers settles",
    () =>
      Effect.gen(function* poolShutdownOrderGen() {
        const events: string[] = [];
        const driver: BossDriver = {
          start: vi.fn(async () => {}),
          ensureQueue: vi.fn(async () => {}),
          work: vi.fn(async () => {}),
          send: vi.fn(async () => {}),
          stop: vi.fn(async () => {
            events.push("queue drained");
          }),
        };
        const { workerLayer } = makeJobQueueLayers(() => driver);
        // A real handle (never queried), so the owner is the only fake.
        const db = yield* Db.pipe(Effect.provide(Db.layer));
        const ended: number[] = [];
        const dbLayer = Db.ownedBy(() => ({
          db,
          end: async (timeoutSeconds) => {
            ended.push(timeoutSeconds);
            events.push("pool ended");
          },
        }));

        yield* provideWorkerLayers(
          Effect.gen(function* runningJob() {
            const fibers = yield* JobFibers;
            // A Job fiber still running at shutdown: JobFibers' release interrupts it, and the
            // interruption handler (the lifecycle settle in production) runs before it ends.
            yield* FiberMap.run(
              fibers.map,
              "job-1",
              Effect.never.pipe(
                Effect.onInterrupt(() =>
                  Effect.sync(() => {
                    events.push("job fiber settled");
                  })
                )
              )
            );
            yield* Effect.yieldNow;
          }),
          workerLayer,
          dbLayer
        );

        expect(events).toEqual([
          "queue drained",
          "job fiber settled",
          "pool ended",
        ]);
        // Bounded: the owner ends the pool once, with a finite timeout.
        expect(ended).toHaveLength(1);
        expect(ended[0]).toBeGreaterThan(0);
        expect(ended[0]).toBeLessThanOrEqual(30);
      })
  );
});
