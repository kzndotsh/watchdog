import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-db";

import { jobStartCounters } from "../../schema/job-start-limits.ts";
import { jobStartCountersRepo } from "../job-start-counters.repo.ts";

const WINDOW_SECONDS = 3600;

describe("jobStartCountersRepo", () => {
  it("takes starts up to the limit in one window and gives a retry time when full", async () => {
    await withTestTx(async (tx) => {
      const input = {
        scope: "key" as const,
        subjectId: `wd480-${randomUUID()}`,
        limit: 2,
        windowSeconds: WINDOW_SECONDS,
      };
      expect(await jobStartCountersRepo.take(tx, input)).toEqual({
        admitted: true,
        used: 1,
      });
      expect(await jobStartCountersRepo.take(tx, input)).toEqual({
        admitted: true,
        used: 2,
      });
      const full = await jobStartCountersRepo.take(tx, input);
      expect(full.admitted).toBe(false);
      if (!full.admitted) {
        expect(full.retryAfterSeconds).toBeGreaterThanOrEqual(1);
        expect(full.retryAfterSeconds).toBeLessThanOrEqual(WINDOW_SECONDS);
      }
      expect(await jobStartCountersRepo.used(tx, input)).toBe(2);
    });
  });

  it("refuses at a limit of 0 without counting", async () => {
    await withTestTx(async (tx) => {
      const input = {
        scope: "organization" as const,
        subjectId: `wd480-${randomUUID()}`,
        limit: 0,
        windowSeconds: WINDOW_SECONDS,
      };
      expect((await jobStartCountersRepo.take(tx, input)).admitted).toBe(false);
      expect(await jobStartCountersRepo.used(tx, input)).toBe(0);
    });
  });

  it("counts a subject once per scope", async () => {
    await withTestTx(async (tx) => {
      const base = {
        subjectId: `wd480-${randomUUID()}`,
        limit: 1,
        windowSeconds: WINDOW_SECONDS,
      };
      const take = async (scope: "key" | "organization") =>
        (await jobStartCountersRepo.take(tx, { ...base, scope })).admitted;
      expect(await take("key")).toBe(true);
      expect(await take("organization")).toBe(true);
      expect(await take("key")).toBe(false);
    });
  });

  it("the first start of a window deletes the subject's counters of ended windows, and only its own", async () => {
    await withTestTx(async (tx) => {
      const mine = `wd480-${randomUUID()}`;
      const theirs = `wd480-${randomUUID()}`;
      await tx.insert(jobStartCounters).values([
        {
          scope: "key",
          subjectId: mine,
          windowStart: sql`now() - interval '3 hours'`,
          count: 9,
        },
        {
          scope: "key",
          subjectId: theirs,
          windowStart: sql`now() - interval '3 hours'`,
          count: 9,
        },
      ]);

      await jobStartCountersRepo.take(tx, {
        scope: "key",
        subjectId: mine,
        limit: 5,
        windowSeconds: WINDOW_SECONDS,
      });

      const rows = await tx
        .select({ subjectId: jobStartCounters.subjectId })
        .from(jobStartCounters);
      const subjects = rows.map((row) => row.subjectId);
      expect(subjects).toContain(theirs);
      expect(subjects.filter((subject) => subject === mine)).toHaveLength(1);
    });
  });
});
