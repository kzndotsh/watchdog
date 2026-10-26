import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import {
  COLLECT_FIXTURE,
  COLLECT_FIXTURE_ORDER_ACTIVITY_DESC,
  COLLECT_FIXTURE_ORDER_STARTED_ASC,
  COLLECT_FIXTURE_ORDER_STARTED_DESC,
  COLLECT_FIXTURE_ROWS,
  collectQueueReference,
  fixtureMinute,
} from "@watchdog/schemas/testing";
import {
  collectQueueDiff,
  readCollectQueue,
  readCollectSource,
  seedCase,
  seedCollectQueueFixture,
  withSystemTestTx,
} from "@watchdog/test-db";

import type { DbExec } from "../exec";

/** The ids of a Case's queue rows in one of the list's orders, read the way the list will read them. */
async function orderedIds(
  exec: DbExec,
  caseId: CaseId,
  order: "activity_desc" | "started_desc" | "started_asc"
): Promise<string[]> {
  const by = {
    activity_desc: sql`q.activity_at desc, q.id desc`,
    started_desc: sql`q.sort_at desc, q.id desc`,
    started_asc: sql`q.sort_at asc, q.id asc`,
  }[order];
  const rows = await exec.execute<{ id: string }>(
    sql`select q.id from public.collect_queue q where q.case_id = ${caseId} and not q.hidden order by ${by}`
  );
  const hidden = await exec.execute<{ id: string }>(
    sql`select q.id from public.collect_queue q where q.case_id = ${caseId} and q.hidden order by ${by}`
  );
  return [...rows.map((r) => r.id), ...hidden.map((r) => r.id)];
}

/** The hand-written orders hold every row; the list reads hidden rows only in hidden mode. */
function splitHidden(ids: readonly string[]): string[] {
  const hidden = new Set([COLLECT_FIXTURE.evidence.h]);
  return [
    ...ids.filter((id) => !hidden.has(id)),
    ...ids.filter((id) => hidden.has(id)),
  ];
}

describe("Collect queue projection: the 12-case fixture", () => {
  it("stores exactly the hand-written rows, members and times", async () => {
    await withSystemTestTx(async (tx) => {
      const c = await seedCase(tx);
      await seedCollectQueueFixture(tx, c.id);
      const stored = await readCollectQueue(tx, c.id);

      expect(
        Object.fromEntries(
          stored.map((row) => [
            row.id,
            {
              kind: row.kind,
              state: row.state,
              sortAt: row.sortAt,
              activityAt: row.activityAt,
              members: [...row.members].sort(),
            },
          ])
        )
      ).toEqual(
        Object.fromEntries(
          Object.entries(COLLECT_FIXTURE_ROWS).map(([id, row]) => [
            id,
            {
              kind: row.kind,
              state: row.state,
              sortAt: fixtureMinute(row.sortMinute),
              activityAt: fixtureMinute(row.activityMinute),
              members: [...row.members].sort(),
            },
          ])
        )
      );
      expect(await collectQueueDiff(tx, c.id)).toEqual([]);
    });
  });

  it("agrees with the TypeScript reference on every column, search text included", async () => {
    await withSystemTestTx(async (tx) => {
      const c = await seedCase(tx);
      await seedCollectQueueFixture(tx, c.id);
      const source = await readCollectSource(tx, c.id);
      expect(await readCollectQueue(tx, c.id)).toEqual(
        collectQueueReference(source)
      );
    });
  });

  it("orders the rows as written by hand under both sorts, ties by id", async () => {
    await withSystemTestTx(async (tx) => {
      const c = await seedCase(tx);
      await seedCollectQueueFixture(tx, c.id);
      expect(await orderedIds(tx, c.id, "activity_desc")).toEqual(
        splitHidden(COLLECT_FIXTURE_ORDER_ACTIVITY_DESC)
      );
      expect(await orderedIds(tx, c.id, "started_desc")).toEqual(
        splitHidden(COLLECT_FIXTURE_ORDER_STARTED_DESC)
      );
      expect(await orderedIds(tx, c.id, "started_asc")).toEqual(
        splitHidden(COLLECT_FIXTURE_ORDER_STARTED_ASC)
      );
    });
  });

  it("keeps a bad input id from failing the flush", async () => {
    await withSystemTestTx(async (tx) => {
      const c = await seedCase(tx);
      await seedCollectQueueFixture(tx, c.id);
      const stored = await readCollectQueue(tx, c.id);
      const ids = stored.map((row) => row.id);
      // The uppercase and the 36-dash inputs linked nothing and still have rows of their own.
      expect(ids).toContain(COLLECT_FIXTURE.jobs.u2);
      expect(ids).toContain(COLLECT_FIXTURE.jobs.u3);
      // The flush ran inside the test's transaction, so a failure would show as a stale row there.
      const stale = await tx.execute<{ diff_id: string }>(
        sql`select * from public.collect_queue_diff(${c.id})`
      );
      expect(stale).toEqual([]);
    });
  });
});
