import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { vi } from "vitest";

import { JOB_LANES } from "@watchdog/caps/sdk";

import { makeJobQueueLayers, type BossDriver } from "../job-queue";
import {
  jobLane,
  laneConcurrency,
  laneQueueName,
  laneSlotsFit,
  workLanesEffect,
} from "../lanes";
import { CASE_EXPORT_JOB } from "../system-jobs";

vi.mock("@watchdog/env/server", () => ({
  env: {
    DATABASE_URL: "postgresql://x:x@127.0.0.1:5432/x",
    WD_WORKER_QUICK_CONCURRENCY: 6,
    WD_WORKER_HEAVY_CONCURRENCY: 3,
    WD_WORKER_ACT_CONCURRENCY: 1,
  },
}));

describe("worker lanes", () => {
  it("names every lane's queue alike, one queue per lane", () => {
    expect(laneQueueName("quick")).toBe("watchdog.cap-jobs.quick");
    expect(laneQueueName("heavy")).toBe("watchdog.cap-jobs.heavy");
    expect(new Set(JOB_LANES.map(laneQueueName)).size).toBe(JOB_LANES.length);
  });

  it("reads each lane's concurrency from configuration", () => {
    expect(laneConcurrency("quick")).toBe(6);
    expect(laneConcurrency("heavy")).toBe(3);
    expect(laneConcurrency("act")).toBe(1);
  });

  it("keeps two pool connections free of lane slots", () => {
    const slots =
      (quick: number, heavy: number, act: number) => (lane: string) =>
        ({ quick, heavy, act })[lane as "quick"];
    // The default lane slots (4 + 2 + 2) fit the worker's pool of 10.
    expect(laneSlotsFit(slots(4, 2, 2), 10)).toEqual({
      fits: true,
      total: 8,
      limit: 8,
    });
    expect(laneSlotsFit(slots(4, 3, 2), 10)).toMatchObject({
      fits: false,
      total: 9,
      limit: 8,
    });
  });

  it("puts system Jobs in heavy and Caps where their descriptors say", () => {
    expect(jobLane(CASE_EXPORT_JOB)).toBe("heavy");
    expect(jobLane("network.dns.lookup")).toBe("quick");
    expect(jobLane("archive.url.submit")).toBe("act");
    expect(jobLane("evidence.eml.analyze")).toBe("heavy");
  });

  it.effect(
    "registers the handler once per lane with that lane's concurrency",
    () =>
      Effect.gen(function* workLanesGen() {
        const work = vi.fn(async () => {});
        const driver: BossDriver = {
          start: async () => {},
          stop: async () => {},
          ensureQueue: async () => {},
          send: async () => {},
          cancel: async () => {},
          work,
        };
        const handler = async () => {};
        yield* Effect.gen(function* registerGen() {
          yield* workLanesEffect(handler, { pollingIntervalSeconds: 2 });
        }).pipe(
          Effect.provide(makeJobQueueLayers(() => driver).workerLayer),
          Effect.scoped
        );
        expect(work.mock.calls).toEqual([
          [
            { lane: "quick", localConcurrency: 6, pollingIntervalSeconds: 2 },
            handler,
          ],
          [
            { lane: "heavy", localConcurrency: 3, pollingIntervalSeconds: 2 },
            handler,
          ],
          [
            { lane: "act", localConcurrency: 1, pollingIntervalSeconds: 2 },
            handler,
          ],
        ]);
      })
  );
});
