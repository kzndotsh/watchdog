import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { seedCase, seedJob, withSystemTestTx } from "@watchdog/test-db";

import { jobs } from "../../schema/jobs.ts";
import { jobsRepo } from "../jobs.repo.ts";

/** Rows within one millisecond of each other: a JavaScript `Date` cannot tell them apart. */
const SAME_MILLISECOND = [
  "2026-01-01T00:00:00.123100Z",
  "2026-01-01T00:00:00.123200Z",
  "2026-01-01T00:00:00.123300Z",
  "2026-01-01T00:00:00.123400Z",
  "2026-01-01T00:00:00.123500Z",
];

describe("keyset pagination", () => {
  it("neither repeats nor skips a job that is updated between two pages", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const ids: string[] = [];
      for (const stamp of SAME_MILLISECOND) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- insertion order is part of the test
        const row = await seedJob(tx, cased.id);
        // oxlint-disable-next-line eslint/no-await-in-loop -- one row at a time
        await tx
          .update(jobs)
          .set({ updatedAt: sql`${stamp}::timestamptz` })
          .where(eq(jobs.id, row.id));
        ids.push(row.id);
      }
      const seenFirst = await jobsRepo.listForCase(tx, cased.id, { limit: 2 });
      const last = seenFirst.at(-1);
      if (last === undefined) throw new Error("page");
      // The job at the cursor is touched after the page was read: its updatedAt moves ahead.
      await tx
        .update(jobs)
        .set({ updatedAt: sql`'2026-02-01T00:00:00.000000Z'::timestamptz` })
        .where(eq(jobs.id, last.job.id));
      const rest = await jobsRepo.listForCase(tx, cased.id, {
        limit: 10,
        after: { id: last.job.id, values: [last.keyTime] },
      });
      const seen = [...seenFirst, ...rest].map((row) => row.job.id);
      expect(new Set(seen).size).toBe(seen.length);
      expect(new Set(seen)).toEqual(new Set(ids));
    });
  });
});
