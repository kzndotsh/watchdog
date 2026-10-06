import { readFileSync } from "node:fs";
import path from "node:path";

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, withTestTx } from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

import { db } from "../../client.ts";
import { ACTIVITY_CHANNEL, listenOnChannel } from "../../events.ts";
import { activity } from "../../schema/activity.ts";
import { activityLogRepo } from "../activity-log.repo.ts";

const START = { xid: "0", id: 0 } as const;

async function untilTrue(
  check: () => boolean,
  timeoutMs = 3000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    // oxlint-disable-next-line eslint/no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
}

describe("activityLogRepo", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("appends a row stamped with the writing transaction's xid", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      const row = await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        subjectId: testId(20),
        label: "Follow up",
        toValue: "backlog",
      });
      expect(row).not.toBeNull();
      expect(row?.xid).toMatch(/^\d+$/);
      expect(row?.xid).not.toBe("0");
      expect(row?.id).toBeGreaterThan(0);
    });
  });

  it("rejects an invalid subject id or case id", async () => {
    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      expect(
        await activityLogRepo.append(tx, {
          caseId: cased.id,
          kind: "task",
          action: "created",
          subjectId: "not-a-uuid",
        })
      ).toBeNull();
      expect(
        await activityLogRepo.append(tx, {
          caseId: "nope",
          kind: "task",
          action: "created",
        })
      ).toBeNull();
    });
  });

  it("refuses a label over 200 characters at the database", async () => {
    const cased = await seedCase(db);
    await expect(
      activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "x".repeat(201),
      })
    ).rejects.toThrow();
  });

  it("drains rows after a cursor in (xid, id) order, org scoped", async () => {
    const cased = await seedCase(db);
    const first = await activityLogRepo.append(db, {
      caseId: cased.id,
      kind: "task",
      action: "created",
      label: "one",
    });
    const second = await activityLogRepo.append(db, {
      caseId: cased.id,
      kind: "task",
      action: "created",
      label: "two",
    });
    const all = await activityLogRepo.drain(db, { after: START, limit: 10 });
    expect(all.map((row) => row.label)).toEqual(["one", "two"]);

    const afterFirst = await activityLogRepo.drain(db, {
      after: { xid: first?.xid ?? "0", id: first?.id ?? 0 },
      limit: 10,
    });
    expect(afterFirst.map((row) => row.id)).toEqual([second?.id]);

    const scoped = await activityLogRepo.drain(db, {
      after: START,
      limit: 10,
      organizationId: TEST_ORGANIZATION_ID,
      caseId: cased.id,
    });
    expect(scoped).toHaveLength(2);
    const foreign = await activityLogRepo.drain(db, {
      after: START,
      limit: 10,
      organizationId: TEST_ORGANIZATION_ID,
      caseId: testId(99),
    });
    expect(foreign).toEqual([]);
  });

  it("holds back a committed row while an older transaction is still open", async () => {
    const cased = await seedCase(db);
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted: () => void = () => {};
    const insertedRow = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    // T1 takes the lower xid and the lower id, then stays open.
    const older = db.transaction(async (tx) => {
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "older, commits last",
      });
      inserted();
      await held;
    });
    try {
      await insertedRow;
      // T2 takes the higher id and commits first.
      await activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "newer, commits first",
      });
      expect(
        await activityLogRepo.drain(db, { after: START, limit: 10 })
      ).toEqual([]);
      expect(await activityLogRepo.hasPast(db, START)).toBe(true);
    } finally {
      release();
      await older;
    }
    const rows = await activityLogRepo.drain(db, { after: START, limit: 10 });
    expect(rows.map((row) => row.label)).toEqual([
      "older, commits last",
      "newer, commits first",
    ]);
    expect(rows[0]?.id).toBeLessThan(rows[1]?.id ?? 0);
  });

  it("reports the newest position, and the safe head", async () => {
    expect(await activityLogRepo.newest(db)).toBeNull();
    expect(await activityLogRepo.head(db)).toEqual(START);
    const cased = await seedCase(db);
    const row = await activityLogRepo.append(db, {
      caseId: cased.id,
      kind: "task",
      action: "created",
    });
    expect(await activityLogRepo.newest(db)).toEqual({
      xid: row?.xid,
      id: row?.id,
    });
    expect(await activityLogRepo.head(db)).toEqual({
      xid: row?.xid,
      id: row?.id,
    });
  });
});

describe("activity_notify trigger", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("notifies at commit with a small wake-up payload, and not on rollback", async () => {
    const cased = await seedCase(db);
    const payloads: string[] = [];
    let ready = false;
    const listener = listenOnChannel(
      ACTIVITY_CHANNEL,
      (payload) => {
        payloads.push(payload);
      },
      () => {
        ready = true;
      }
    );
    try {
      await untilTrue(() => ready);

      await expect(
        db.transaction(async (tx) => {
          await activityLogRepo.append(tx, {
            caseId: cased.id,
            kind: "task",
            action: "created",
            label: "rolled back",
          });
          throw new Error("boom");
        })
      ).rejects.toThrow("boom");

      const committed = await activityLogRepo.append(db, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "committed",
      });
      await untilTrue(() => payloads.length > 0);
      // Settle: a leaked rollback NOTIFY would have arrived before the commit's.
      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });

      expect(payloads).toHaveLength(1);
      const parsed: unknown = JSON.parse(payloads[0] ?? "null");
      expect(parsed).toEqual({ id: committed?.id, caseId: cased.id });
      expect((payloads[0] ?? "").length).toBeLessThan(120);
      expect(await db.select({ id: activity.id }).from(activity)).toHaveLength(
        1
      );
    } finally {
      await listener.end();
    }
  });
});

describe("activity backfill (migration 0015)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("copies activity_events rows in with xid 0, in time order, label cut to 200", async () => {
    const migration = readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../drizzle/0015_activity_trigger_and_backfill.sql"
      ),
      "utf-8"
    );
    const backfill = migration
      .split("--> statement-breakpoint")
      .find((chunk) => chunk.includes('INSERT INTO "activity"'));
    expect(backfill).toBeDefined();

    await withTestTx(async (tx) => {
      const cased = await seedCase(tx);
      await tx.execute(sql`
        INSERT INTO activity_events (case_id, kind, action, subject_id, label, actor_id, from_value, to_value, created_at)
        VALUES
          (${cased.id}, 'task', 'status_changed', ${testId(21)}, 'later', 'u1', 'backlog', 'done', '2026-01-02T00:00:00Z'),
          (${cased.id}, 'task', 'created', ${testId(21)}, ${"y".repeat(250)}, NULL, NULL, 'backlog', '2026-01-01T00:00:00Z')
      `);
      await tx.execute(sql.raw(backfill ?? ""));
      const rows = await activityLogRepo.drain(tx, {
        after: START,
        limit: 10,
      });
      expect(rows.map((row) => row.action)).toEqual([
        "created",
        "status_changed",
      ]);
      expect(rows.every((row) => row.xid === "0")).toBe(true);
      expect(rows[0]?.label).toHaveLength(200);
      expect(rows[1]).toMatchObject({
        label: "later",
        actorId: "u1",
        fromValue: "backlog",
        toValue: "done",
      });
      expect(rows[0]?.id).toBeLessThan(rows[1]?.id ?? 0);
    });
  });
});
