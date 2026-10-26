import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import {
  seedCase,
  seedEntity,
  seedJob,
  withSystemTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { DbTx } from "../../exec.ts";
import { claims } from "../../schema/claims.ts";
import { jobs } from "../../schema/jobs.ts";
import type { KeysetAfter } from "../_keyset.ts";
import { claimsRepo } from "../claims.repo.ts";
import { jobsRepo } from "../jobs.repo.ts";

/** Rows within one millisecond of each other: a JavaScript `Date` cannot tell them apart. */
const SAME_MILLISECOND = [
  "2026-01-01T00:00:00.123100Z",
  "2026-01-01T00:00:00.123200Z",
  "2026-01-01T00:00:00.123300Z",
  "2026-01-01T00:00:00.123400Z",
  "2026-01-01T00:00:00.123500Z",
];

const byText = (a: string, b: string) => (a < b ? -1 : 1);

async function seedClaims(tx: DbTx, count: number) {
  const cased = await seedCase(tx);
  const entity = await seedEntity(tx, cased.id, { id: testId(20) });
  const ids: string[] = [];
  for (let i = 0; i < count; i += 1) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- insertion order is part of the test
    const row = await claimsRepo.create(tx, {
      entityId: entity.id,
      caseId: cased.id,
      text: `claim ${i}`,
      class: "observation",
      confidence: "unverified",
    });
    if (!row) throw new Error("claim");
    ids.push(row.id);
  }
  return { cased, entity, ids };
}

async function pageClaims(tx: DbTx, entityId: string, limit: number) {
  const seen: string[] = [];
  let after: KeysetAfter | undefined;
  for (;;) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- each page starts after the last row of the one before
    const rows = await claimsRepo.listForEntity(tx, entityId, {
      limit,
      ...(after === undefined ? {} : { after }),
    });
    seen.push(...rows.map((row) => row.id));
    const last = rows.at(-1);
    if (rows.length < limit || last === undefined) return seen;
    after = { id: last.id, values: [last.keyTime] };
  }
}

describe("keyset pagination", () => {
  it("pages rows that differ only by microseconds without a repeat or a gap", async () => {
    await withSystemTestTx(async (tx) => {
      const { entity, ids } = await seedClaims(tx, SAME_MILLISECOND.length);
      for (const [index, id] of ids.entries()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one row at a time
        await tx
          .update(claims)
          .set({ createdAt: sql`${SAME_MILLISECOND[index]}::timestamptz` })
          .where(eq(claims.id, id));
      }
      // Oldest first: the order they were stamped, whichever ids they drew.
      expect(await pageClaims(tx, entity.id, 1)).toEqual(ids);
      expect(await pageClaims(tx, entity.id, 2)).toEqual(ids);
    });
  });

  it("pages rows that share one timestamp by id", async () => {
    await withSystemTestTx(async (tx) => {
      // One transaction: every row has the transaction's `now()`.
      const { entity, ids } = await seedClaims(tx, 5);
      const whole = await pageClaims(tx, entity.id, 100);
      expect(new Set(whole)).toEqual(new Set(ids));
      expect(whole).toEqual([...ids].sort(byText));
      expect(await pageClaims(tx, entity.id, 2)).toEqual(whole);
    });
  });

  it("continues after the row the cursor names was deleted", async () => {
    await withSystemTestTx(async (tx) => {
      const { entity, ids } = await seedClaims(tx, 5);
      for (const [index, id] of ids.entries()) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- one row at a time
        await tx
          .update(claims)
          .set({ createdAt: sql`${SAME_MILLISECOND[index]}::timestamptz` })
          .where(eq(claims.id, id));
      }
      const first = await claimsRepo.listForEntity(tx, entity.id, { limit: 2 });
      const last = first.at(-1);
      if (last === undefined) throw new Error("page");
      await tx.delete(claims).where(eq(claims.id, last.id));
      const rest = await claimsRepo.listForEntity(tx, entity.id, {
        limit: 10,
        after: { id: last.id, values: [last.keyTime] },
      });
      // The cursor holds the key itself, not a lookup of its row: exactly what followed it.
      expect(rest.map((row) => row.id)).toEqual(ids.slice(2));
    });
  });

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
