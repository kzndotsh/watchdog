import { describe, expect, it } from "vitest";

import { client } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  captureStatements,
  expectQueries,
  seedCase,
  withTestTx,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import type { DbExec } from "../../exec.ts";
import { activity } from "../../schema/activity.ts";
import {
  activityLogRepo,
  type RecentActivityLogRow,
} from "../activity-log.repo.ts";

/**
 * Recent activity (performance spec #250, finding B4). The feed ranks entries within their
 * `group_id` before it limits, which used to window-rank the whole history of the organization.
 * It now ranks inside a lookback window and widens the window only while the page is short,
 * so the answer must stay exactly what the unbounded query gave.
 */
const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-06T12:00:00.000Z");
const FILTERS = [
  { kind: "job", actions: ["queued", "running", "succeeded"] },
  { kind: "task", actions: ["created"] },
] as const;

function ago(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

type Entry = {
  caseId: Awaited<ReturnType<typeof seedCase>>["id"];
  kind: "job" | "task" | "evidence";
  action: string;
  ageDays: number;
  groupId?: string;
};

async function insertEntries(exec: DbExec, entries: readonly Entry[]) {
  const rows = await exec
    .insert(activity)
    .values(
      entries.map((entry) => ({
        caseId: entry.caseId,
        kind: entry.kind,
        action: entry.action,
        groupId: entry.groupId ?? null,
        label: `${entry.kind}-${entry.action}-${entry.ageDays}`,
        createdAt: ago(entry.ageDays),
      }))
    )
    .returning({ id: activity.id });
  return rows.map((row) => row.id);
}

/**
 * The semantics, restated over every stored row: admit by allowlist, keep the newest entry of
 * each group (an entry with no group is its own group), newest first, then limit.
 */
async function reference(
  exec: DbExec,
  limit: number
): Promise<RecentActivityLogRow["id"][]> {
  const rows = await exec.select().from(activity);
  const admitted = rows.filter((row) =>
    FILTERS.some(
      (filter) =>
        filter.kind === row.kind &&
        (filter.actions as readonly string[]).includes(row.action)
    )
  );
  const newestOfGroup = new Map<string, (typeof admitted)[number]>();
  for (const row of admitted) {
    const key = row.groupId ?? `solo:${row.id}`;
    const best = newestOfGroup.get(key);
    const newer =
      best === undefined ||
      row.createdAt.getTime() > best.createdAt.getTime() ||
      (row.createdAt.getTime() === best.createdAt.getTime() &&
        row.id > best.id);
    if (newer) newestOfGroup.set(key, row);
  }
  return [...newestOfGroup.values()]
    .sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id
    )
    .slice(0, limit)
    .map((row) => row.id);
}

function feed(exec: DbExec, limit: number) {
  return activityLogRepo.recentFeed(exec, {
    organizationId: TEST_ORGANIZATION_ID,
    filters: FILTERS,
    limit,
    now: NOW,
  });
}

describe("activityLogRepo.recentFeed: lookback window", () => {
  it("returns exactly the unbounded answer whatever the page size and history", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx, { slug: "window-a" });
      const other = await seedCase(tx, { slug: "window-b" });
      // Run groups: `runOld` has its newest member 40 days ago and one at 200; `runSpan` has
      // its newest 2 days ago and older ones in every window; `runAncient` has only old members.
      const runOld = testId(60);
      const runSpan = testId(61);
      const runAncient = testId(62);
      const entries: Entry[] = [
        { caseId: cased.id, kind: "job", action: "queued", ageDays: 0.2 },
        { caseId: cased.id, kind: "job", action: "running", ageDays: 0.2 },
        { caseId: cased.id, kind: "task", action: "created", ageDays: 0.5 },
        { caseId: other.id, kind: "job", action: "queued", ageDays: 1.5 },
        {
          caseId: cased.id,
          kind: "job",
          action: "queued",
          ageDays: 2,
          groupId: runSpan,
        },
        {
          caseId: cased.id,
          kind: "job",
          action: "running",
          ageDays: 6,
          groupId: runSpan,
        },
        {
          caseId: cased.id,
          kind: "job",
          action: "succeeded",
          ageDays: 25,
          groupId: runSpan,
        },
        {
          caseId: cased.id,
          kind: "job",
          action: "queued",
          ageDays: 200,
          groupId: runSpan,
        },
        { caseId: cased.id, kind: "task", action: "created", ageDays: 9 },
        { caseId: other.id, kind: "task", action: "created", ageDays: 20 },
        {
          caseId: cased.id,
          kind: "job",
          action: "queued",
          ageDays: 40,
          groupId: runOld,
        },
        {
          caseId: cased.id,
          kind: "job",
          action: "running",
          ageDays: 200,
          groupId: runOld,
        },
        { caseId: cased.id, kind: "task", action: "created", ageDays: 80 },
        {
          caseId: other.id,
          kind: "job",
          action: "succeeded",
          ageDays: 150,
          groupId: runAncient,
        },
        {
          caseId: other.id,
          kind: "job",
          action: "queued",
          ageDays: 400,
          groupId: runAncient,
        },
        // Not admitted by the allowlist, at any age.
        {
          caseId: cased.id,
          kind: "evidence",
          action: "captured",
          ageDays: 0.1,
        },
        { caseId: cased.id, kind: "task", action: "deleted", ageDays: 0.1 },
      ];
      await insertEntries(tx, entries);
      const limits = [1, 2, 3, 5, 8, 9, 10, 50];
      const pages = await Promise.all(
        limits.map(async (limit) => feed(tx, limit))
      );
      const expected = await Promise.all(
        limits.map(async (limit) => reference(tx, limit))
      );
      for (const [index, rows] of pages.entries()) {
        expect(
          rows.map((row) => row.id),
          `limit ${limits[index]}`
        ).toEqual(expected[index]);
      }
    });
  });

  it("is unchanged for an organization whose whole history is one page", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx, { slug: "window-small" });
      await insertEntries(tx, [
        { caseId: cased.id, kind: "job", action: "queued", ageDays: 3 },
        { caseId: cased.id, kind: "task", action: "created", ageDays: 60 },
      ]);
      const rows = await feed(tx, 15);
      expect(rows.map((row) => row.id)).toEqual(await reference(tx, 15));
      expect(rows).toHaveLength(2);
    });
  });

  it("answers a busy organization from the newest day in one statement", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx, { slug: "window-busy" });
      await insertEntries(
        tx,
        Array.from({ length: 12 }, (_, index) => ({
          caseId: cased.id,
          kind: "task" as const,
          action: "created",
          ageDays: 0.01 * (index + 1),
        }))
      );
      await insertEntries(tx, [
        { caseId: cased.id, kind: "task", action: "created", ageDays: 300 },
      ]);
      const rows = await expectQueries(1, () => feed(tx, 10));
      expect(rows.map((row) => row.id)).toEqual(await reference(tx, 10));
    });
  });

  it("widens the window a bounded number of times for a short page", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx, { slug: "window-quiet" });
      await insertEntries(tx, [
        { caseId: cased.id, kind: "task", action: "created", ageDays: 365 },
      ]);
      // 1 day, 7 days, 30 days, then everything.
      const rows = await expectQueries({ max: 4 }, () => feed(tx, 10));
      expect(rows).toHaveLength(1);
    });
  });

  it("bounds the ranked entries by created_at, and an index leads with it", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx, { slug: "window-plan" });
      await insertEntries(tx, [
        { caseId: cased.id, kind: "task", action: "created", ageDays: 0.1 },
      ]);
      const { statements } = await captureStatements(() => feed(tx, 10));
      const [statement] = statements;
      if (statement === undefined) throw new Error("no statement");
      expect(statement.sql).toMatch(/"created_at" >= \$\d+/);
      // A tiny test table makes the planner prefer the Case index whatever else exists, so the
      // plan itself (no external sort at scale) is checked on the frozen seed (perf-baseline.md).
      const leading = await client<{ attname: string }[]>`
        select a.attname
        from pg_index x
        join pg_attribute a on a.attrelid = x.indrelid and a.attnum = x.indkey[0]
        where x.indrelid = 'public.activity'::regclass and x.indpred is null`;
      expect(leading.map((row) => row.attname)).toContain("created_at");
    });
  });
});
