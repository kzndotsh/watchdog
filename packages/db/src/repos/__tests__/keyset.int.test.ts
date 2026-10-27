import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { jobList } from "@watchdog/schemas/jobs";
import {
  seedCase,
  seedJob,
  seedPlaybookRun,
  withSystemTestTx,
} from "@watchdog/test-db";

import { jobs } from "../../schema/jobs.ts";
import { jobListRepo } from "../job-list.repo.ts";
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
      const scope = { caseId: cased.id };
      const query = jobList.queryOf({});
      const seenFirst = await jobListRepo.page(tx, scope, query, {
        limit: 2,
        after: undefined,
      });
      const last = seenFirst.at(-1);
      if (last === undefined) throw new Error("page");
      // The job at the cursor is touched after the page was read: its updatedAt moves ahead.
      await tx
        .update(jobs)
        .set({ updatedAt: sql`'2026-02-01T00:00:00.000000Z'::timestamptz` })
        .where(eq(jobs.id, last.id));
      const rest = await jobListRepo.page(tx, scope, query, {
        limit: 10,
        after: { id: last.id, value: last.listKey },
      });
      const seen = [...seenFirst, ...rest].map((row) => row.id);
      expect(new Set(seen).size).toBe(seen.length);
      expect(new Set(seen)).toEqual(new Set(ids));
    });
  });

  it("lists a run's Jobs oldest first, whatever order an index would give", async () => {
    await withSystemTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const run = await seedPlaybookRun(tx, cased.id);
      const first = await seedJob(tx, cased.id, { playbookRunId: run.id });
      const retry = await seedJob(tx, cased.id, { playbookRunId: run.id });
      await tx
        .update(jobs)
        .set({
          createdAt: sql`'2026-01-01T00:00:00Z'::timestamptz`,
          updatedAt: sql`'2026-01-01T00:00:00Z'::timestamptz`,
        })
        .where(eq(jobs.id, first.id));
      await tx
        .update(jobs)
        .set({
          createdAt: sql`'2026-02-01T00:00:00Z'::timestamptz`,
          updatedAt: sql`'2026-03-01T00:00:00Z'::timestamptz`,
        })
        .where(eq(jobs.id, retry.id));

      // The retry was updated last, so `jobs_playbook_run_updated_idx` lists it first: the run's
      // Jobs are read oldest first all the same. A tiny table is read by sequential scan, so the
      // index is forced for the test to see the difference.
      await tx.execute(sql`set local enable_seqscan = off`);
      const members = await jobsRepo.listForPlaybookRun(tx, run.id);
      expect(members.map((row) => row.id)).toEqual([first.id, retry.id]);
    });
  });
});
