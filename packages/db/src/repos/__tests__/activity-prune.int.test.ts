import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { ActivityCursor } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  captureStatements,
  explainPlan,
  seedCase,
  withTestTx,
} from "@watchdog/test-db";

import type { DbExec } from "../../exec.ts";
import { activity } from "../../schema/activity.ts";
import { activityLogRepo } from "../activity-log.repo.ts";

/**
 * The activity prune (performance spec #250, finding B6). It ran a correlated `keep_from`
 * subquery once per candidate row, on the wrong index. It now finds each Case's keep boundary
 * once; what it deletes must not change: entries created before the cutoff, below the Case's
 * newest `keepPerCase`, at or below the consumer cursor, oldest `(xid, id)` first, `limit` of them.
 */
const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-06T12:00:00.000Z");
const BEFORE = new Date(NOW.getTime() - 90 * DAY_MS);

type Seeded = {
  id: number;
  caseId: CaseId;
  xid: string;
  createdAt: Date;
};

/** Rows of three Cases, mixed ages, with ids and xids that do NOT rise together. */
async function seedLog(exec: DbExec): Promise<{ rows: Seeded[] }> {
  const cases: CaseId[] = [
    (await seedCase(exec, { slug: "prune-a" })).id,
    (await seedCase(exec, { slug: "prune-b" })).id,
    (await seedCase(exec, { slug: "prune-c" })).id,
  ];
  const values: { caseId: CaseId; xid: string; ageDays: number }[] = [];
  // Interleave the Cases so one Case's ids are spread across the table, and give every fifth
  // row a lower xid than the rows before it (a backfilled or restored position).
  for (let i = 0; i < 90; i += 1) {
    const caseId = cases[i % 3];
    if (caseId === undefined) throw new Error("case");
    const ageDays = [200, 150, 120, 95, 91, 89, 30, 5, 1][i % 9] ?? 1;
    values.push({
      caseId,
      xid: i % 5 === 0 ? "0" : String(1000 + i),
      ageDays,
    });
  }
  // A Case with fewer entries than any keep size, all old.
  const small = (await seedCase(exec, { slug: "prune-d" })).id;
  cases.push(small);
  for (let i = 0; i < 3; i += 1)
    values.push({ caseId: small, xid: "0", ageDays: 300 });

  const rows: Seeded[] = [];
  for (const value of values) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- ids must be assigned in this order
    const [row] = await exec
      .insert(activity)
      .values({
        caseId: value.caseId,
        kind: "task",
        action: "created",
        xid: sql`${value.xid}::xid8`,
        createdAt: new Date(NOW.getTime() - value.ageDays * DAY_MS),
      })
      .returning({
        id: activity.id,
        xid: activity.xid,
        createdAt: activity.createdAt,
      });
    if (row === undefined) throw new Error("insert");
    rows.push({
      id: row.id,
      caseId: value.caseId,
      xid: row.xid,
      createdAt: row.createdAt,
    });
  }
  return { rows };
}

function byPosition(a: Seeded, b: Seeded): number {
  const ax = BigInt(a.xid);
  const bx = BigInt(b.xid);
  if (ax !== bx) return ax < bx ? -1 : 1;
  return a.id - b.id;
}

/** The retention rule restated over the stored rows. */
function expectedBatch(
  rows: readonly Seeded[],
  opts: { keepPerCase: number; limit: number; notPast: ActivityCursor | null }
): Seeded[] {
  const keepFrom = new Map<string, number>();
  for (const caseId of new Set(rows.map((row) => row.caseId))) {
    const ids = rows
      .flatMap((row) => (row.caseId === caseId ? [row.id] : []))
      .sort((a, b) => b - a);
    keepFrom.set(
      caseId,
      opts.keepPerCase === 0
        ? Number.MAX_SAFE_INTEGER
        : (ids[opts.keepPerCase - 1] ?? 0)
    );
  }
  return rows
    .filter((row) => row.createdAt.getTime() < BEFORE.getTime())
    .filter((row) => row.id < (keepFrom.get(row.caseId) ?? 0))
    .filter((row) => {
      if (opts.notPast === null) return true;
      const bx = BigInt(opts.notPast.xid);
      const rx = BigInt(row.xid);
      return rx < bx || (rx === bx && row.id <= opts.notPast.id);
    })
    .sort(byPosition)
    .slice(0, opts.limit);
}

async function remaining(exec: DbExec): Promise<number[]> {
  const rows = await exec.select({ id: activity.id }).from(activity);
  return rows.map((row) => row.id).sort((a, b) => a - b);
}

describe("activityLogRepo.pruneBatch: what is deleted", () => {
  const CASES: {
    keepPerCase: number;
    limit: number;
    notPast: ActivityCursor | null;
  }[] = [
    { keepPerCase: 0, limit: 5000, notPast: null },
    { keepPerCase: 0, limit: 7, notPast: null },
    { keepPerCase: 1, limit: 5000, notPast: null },
    { keepPerCase: 5, limit: 5000, notPast: null },
    { keepPerCase: 5, limit: 4, notPast: null },
    { keepPerCase: 30, limit: 5000, notPast: null },
    { keepPerCase: 200, limit: 5000, notPast: null },
    { keepPerCase: 0, limit: 5000, notPast: { xid: "1010", id: 40 } },
    { keepPerCase: 3, limit: 9, notPast: { xid: "0", id: 1_000_000 } },
  ];

  it.each(CASES)("matches the retention rule for %j", async (opts) => {
    await withTestTx(async (tx) => {
      const { rows } = await seedLog(tx);
      const expected = expectedBatch(rows, opts);
      const result = await activityLogRepo.pruneBatch(tx, {
        before: BEFORE,
        ...opts,
      });
      const left = await remaining(tx);
      const deleted = rows
        .map((row) => row.id)
        .filter((id) => !left.includes(id))
        .sort((a, b) => a - b);
      expect(deleted).toEqual(
        expected.map((row) => row.id).sort((a, b) => a - b)
      );
      expect(result.count).toBe(expected.length);
      const newest = expected.at(-1);
      expect(result.newest).toEqual(
        newest === undefined ? null : { xid: newest.xid, id: newest.id }
      );
    });
  });
});

describe("activityLogRepo.pruneBatch: plan", () => {
  it("finds each Case's keep boundary once, through (case_id, id desc)", async () => {
    await withTestTx(async (tx) => {
      await seedLog(tx);
      const { statements } = await captureStatements(() =>
        activityLogRepo.pruneBatch(tx, {
          before: BEFORE,
          keepPerCase: 5,
          limit: 5000,
        })
      );
      const [select] = statements;
      if (select === undefined) throw new Error("no statement");
      const plan = JSON.stringify(await explainPlan(select));
      // One probe per Case in a CTE, on the index that gives the order...
      expect(plan).toContain('"Subplan Name":"CTE keep"');
      expect(plan).toContain('"Index Name":"activity_case_id_id_idx"');
      // ...and never the primary key walked backward and filtered by Case.
      expect(plan).not.toMatch(
        /"Scan Direction":"Backward"[^}]*"Index Name":"activity_pkey"/
      );
      expect(plan).not.toMatch(
        /"Index Name":"activity_pkey"[^}]*"Scan Direction":"Backward"/
      );
    });
  });
});
