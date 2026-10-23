import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { runDomain } from "@watchdog/core/infra";
import { pruneJobStartCountersEffect } from "@watchdog/core/worker";
import {
  countJobStartCounters,
  resetTestDb,
  seedEndedJobStarts,
  seedJobStarts,
  testDb,
} from "@watchdog/test-db";

const WINDOW_SECONDS = 3600;

describe("pruneJobStartCountersEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("deletes the counters of ended windows of idle and deleted subjects, and keeps the current window's", async () => {
    const idle = Array.from({ length: 5 }, () => `wd480-${randomUUID()}`);
    await seedEndedJobStarts(testDb, { scope: "key", subjectIds: idle });
    await seedEndedJobStarts(testDb, {
      scope: "organization",
      subjectIds: [`wd480-${randomUUID()}`],
    });
    await seedJobStarts(testDb, {
      scope: "organization",
      subjectId: "wd480-live",
      windowSeconds: WINDOW_SECONDS,
      count: 2,
    });

    const summary = await runDomain(pruneJobStartCountersEffect());

    expect(summary).toEqual({ removed: 6 });
    expect(await countJobStartCounters(testDb)).toBe(1);
    expect(await runDomain(pruneJobStartCountersEffect())).toEqual({
      removed: 0,
    });
  });

  it("is bounded: at most batch times maxBatches rows a run, the next run takes the rest", async () => {
    await seedEndedJobStarts(testDb, {
      scope: "key",
      subjectIds: Array.from({ length: 7 }, () => `wd480-${randomUUID()}`),
    });

    const first = await runDomain(
      pruneJobStartCountersEffect({ batch: 2, maxBatches: 2 })
    );
    expect(first).toEqual({ removed: 4 });
    expect(await countJobStartCounters(testDb)).toBe(3);

    const second = await runDomain(
      pruneJobStartCountersEffect({ batch: 2, maxBatches: 2 })
    );
    expect(second).toEqual({ removed: 3 });
    expect(await countJobStartCounters(testDb)).toBe(0);
  });
});
