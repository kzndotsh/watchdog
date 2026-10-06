import { Effect, Fiber } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ACTIVITY_KEEP_PER_CASE,
  ACTIVITY_PRUNE_BATCH,
  ACTIVITY_RETENTION_DAYS,
  pruneActivityEffect,
  repairRestoredActivityXidsEffect,
  replayActivityEffect,
  runActivityConsumerEffect,
} from "@watchdog/core/activity";
import { Db, runDomain } from "@watchdog/core/infra";
import {
  activity,
  activityCursorsRepo,
  activityFloorRepo,
  activityLogRepo,
  client,
  db,
} from "@watchdog/db";
import type { ActivityCursor } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";

const DAY_MS = 86_400_000;
const NOW = new Date("2026-10-06T12:00:00.000Z");
const START: ActivityCursor = { xid: "0", id: 0 };

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function until(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 4000
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  // oxlint-disable-next-line eslint/no-await-in-loop
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    // oxlint-disable-next-line eslint/no-await-in-loop
    await sleep(15);
  }
}

/** One entry per call, in its own transaction, with a chosen `created_at`. */
async function append(caseId: CaseId, label: string, ageDays: number) {
  const [row] = await db
    .insert(activity)
    .values({
      caseId,
      kind: "task",
      action: "created",
      label,
      createdAt: daysAgo(ageDays),
    })
    .returning();
  if (row === undefined) throw new Error("insert failed");
  return row;
}

function cursorOf(row: { xid: string; id: number }): ActivityCursor {
  return { xid: row.xid, id: row.id };
}

async function labels(): Promise<string[]> {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.map((row) => row.label ?? "");
}

function prune(opts: Parameters<typeof pruneActivityEffect>[0] = {}) {
  return runDomain(pruneActivityEffect({ now: NOW, keepPerCase: 0, ...opts }));
}

function replayAfter(after: ActivityCursor) {
  return runDomain(
    replayActivityEffect({ organizationId: TEST_ORGANIZATION_ID, after })
  );
}

describe("retention constants", () => {
  it("follow ADR-0005 decision 8", () => {
    expect(ACTIVITY_RETENTION_DAYS).toBe(90);
    expect(ACTIVITY_KEEP_PER_CASE).toBe(200);
    expect(ACTIVITY_PRUNE_BATCH).toBe(5000);
  });
});

describe("pruneActivityEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("deletes entries older than the retention window and keeps the rest", async () => {
    const cased = await seedCase(db);
    await append(cased.id, "ancient", 400);
    await append(cased.id, "old", 91);
    await append(cased.id, "edge", 89);
    await append(cased.id, "fresh", 1);
    const result = await prune();
    expect(result.pruned).toBe(2);
    expect(await labels()).toEqual(["edge", "fresh"]);
  });

  it("never prunes below the newest N entries of a Case, however old", async () => {
    const busy = await seedCase(db, { slug: "busy" });
    const quiet = await seedCase(db, { slug: "quiet" });
    for (const label of ["b1", "b2", "b3", "b4"]) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await append(busy.id, label, 200);
    }
    await append(quiet.id, "q1", 200);
    const result = await prune({ keepPerCase: 2 });
    expect(result.pruned).toBe(2);
    expect(await labels()).toEqual(["b3", "b4", "q1"]);
  });

  it("works through a backlog in batches", async () => {
    const cased = await seedCase(db);
    for (let i = 0; i < 7; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop
      await append(cased.id, `old-${i}`, 120);
    }
    await append(cased.id, "fresh", 0);
    const result = await prune({ batchSize: 3 });
    expect(result).toEqual({ pruned: 7, batches: 3 });
    expect(await labels()).toEqual(["fresh"]);
  });

  it("raises the replay floor to the newest pruned entry and leaves it alone when nothing is pruned", async () => {
    const cased = await seedCase(db);
    expect(await activityFloorRepo.get(db)).toBeNull();
    await append(cased.id, "fresh", 1);
    await prune();
    expect(await activityFloorRepo.get(db)).toBeNull();

    const gone = await append(cased.id, "old", 100);
    await append(cased.id, "fresh again", 1);
    await prune();
    expect(await activityFloorRepo.get(db)).toEqual(cursorOf(gone));
  });

  it("never lowers the floor", async () => {
    const cased = await seedCase(db);
    const high = await append(cased.id, "high", 100);
    await append(cased.id, "keep", 1);
    const raised = { xid: high.xid, id: high.id + 1000 };
    await activityFloorRepo.raise(db, raised);
    await prune();
    expect(await activityFloorRepo.get(db)).toEqual(raised);
  });

  it("does not prune entries a live durable consumer has not read yet", async () => {
    const cased = await seedCase(db);
    const read = await append(cased.id, "read", 120);
    await append(cased.id, "unread-1", 110);
    await append(cased.id, "unread-2", 100);
    await append(cased.id, "fresh", 1);
    await activityCursorsRepo.set(db, "slow", cursorOf(read));
    const result = await prune();
    expect(result.pruned).toBe(1);
    expect(await labels()).toEqual(["unread-1", "unread-2", "fresh"]);
    expect(await activityFloorRepo.get(db)).toEqual(cursorOf(read));
  });

  it("ignores a consumer whose cursor has not moved for the whole window (it resyncs instead)", async () => {
    const cased = await seedCase(db);
    const read = await append(cased.id, "read", 200);
    await append(cased.id, "unread", 150);
    await append(cased.id, "fresh", 1);
    await activityCursorsRepo.set(db, "abandoned", cursorOf(read));
    await client`UPDATE activity_cursors SET updated_at = ${daysAgo(120).toISOString()}::timestamptz`;
    const result = await prune();
    expect(result.pruned).toBe(2);
    expect(await labels()).toEqual(["fresh"]);
  });

  it("holds back by cursor order across Cases", async () => {
    const one = await seedCase(db, { slug: "one" });
    const two = await seedCase(db, { slug: "two" });
    await append(one.id, "one-old", 100);
    const mid = await append(two.id, "two-old", 100);
    await append(one.id, "one-old-2", 100);
    await activityCursorsRepo.set(db, "slow", cursorOf(mid));
    const result = await prune();
    expect(result.pruned).toBe(2);
    expect(await labels()).toEqual(["one-old-2"]);
  });
});

describe("replay floor", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("answers resync to a cursor below the floor and replays from the floor on", async () => {
    const cased = await seedCase(db);
    const first = await append(cased.id, "first", 100);
    const second = await append(cased.id, "second", 100);
    await append(cased.id, "third", 1);
    await prune();
    expect(await activityFloorRepo.get(db)).toEqual(cursorOf(second));

    expect(await replayAfter(cursorOf(first))).toEqual({ kind: "resync" });

    const atFloor = await replayAfter(cursorOf(second));
    expect(atFloor.kind).toBe("entries");
    if (atFloor.kind === "entries") {
      expect(atFloor.entries.map((entry) => entry.label)).toEqual(["third"]);
    }
  });

  it("a floor above an emptied log does not make a cursor at the floor look ahead of the log", async () => {
    const cased = await seedCase(db);
    const gone = await append(cased.id, "gone", 100);
    await activityFloorRepo.raise(db, cursorOf(gone));
    await db.delete(activity);
    expect(await replayAfter(cursorOf(gone))).toEqual({
      kind: "entries",
      entries: [],
    });
  });

  it("still answers resync to a cursor ahead of the database", async () => {
    const cased = await seedCase(db);
    await append(cased.id, "only", 1);
    expect(
      await replayAfter({ xid: "18446744073709551000", id: 99_999 })
    ).toEqual({ kind: "resync" });
  });
});

describe("worker consumer and the floor", () => {
  const CONSUMER = "floor-consumer";
  const running: Fiber.Fiber<unknown, unknown>[] = [];
  const resyncs: (readonly CaseId[])[] = [];
  const handled: string[] = [];

  function start() {
    const fiber = Effect.runFork(
      runActivityConsumerEffect({
        consumer: CONSUMER,
        handle: (entry) =>
          Effect.sync(() => {
            handled.push(entry.label ?? "");
          }),
        onResync: (caseIds) =>
          Effect.sync(() => {
            resyncs.push(caseIds);
          }),
      }).pipe(Effect.provide(Db.layer))
    );
    running.push(fiber);
    return fiber;
  }

  async function stopAll() {
    await Promise.all(
      running
        .splice(0)
        .map((fiber) => Effect.runPromise(Fiber.interrupt(fiber)))
    );
  }

  beforeEach(async () => {
    await resetTestDb();
    resyncs.length = 0;
    handled.length = 0;
  });

  afterEach(async () => {
    await stopAll();
  });

  it("resyncs a stored cursor that is below the floor, then stores a cursor at or above it", async () => {
    const one = await seedCase(db, { slug: "one" });
    const two = await seedCase(db, { slug: "two" });
    const stale = await append(one.id, "stale", 200);
    const pruned = await append(one.id, "pruned", 100);
    const head = await append(two.id, "head", 1);
    await activityCursorsRepo.set(db, CONSUMER, cursorOf(stale));
    await client`DELETE FROM activity WHERE id = ${pruned.id}`;
    await activityFloorRepo.raise(db, cursorOf(pruned));

    start();
    await until(() => resyncs.length === 1);
    expect([...(resyncs[0] ?? [])].sort()).toEqual([one.id, two.id].sort());
    await until(async () => {
      const stored = await activityCursorsRepo.get(db, CONSUMER);
      return stored !== null && stored.id === head.id;
    });
    expect(handled).toEqual([]);
  });

  it("does not resync a cursor that sits at the floor", async () => {
    const cased = await seedCase(db);
    const pruned = await append(cased.id, "pruned", 100);
    await append(cased.id, "after", 1);
    await activityFloorRepo.raise(db, cursorOf(pruned));
    await client`DELETE FROM activity WHERE id = ${pruned.id}`;
    await activityCursorsRepo.set(db, CONSUMER, cursorOf(pruned));
    start();
    await until(() => handled.length === 1);
    expect(handled).toEqual(["after"]);
    expect(resyncs).toEqual([]);
  });

  it("does not resync on every boot when the floor is above an emptied log", async () => {
    const cased = await seedCase(db);
    const pruned = await append(cased.id, "pruned", 100);
    await activityFloorRepo.raise(db, cursorOf(pruned));
    await db.delete(activity);
    await activityCursorsRepo.set(db, CONSUMER, { xid: "1", id: 1 });
    start();
    await until(() => resyncs.length === 1);
    await until(async () => {
      const stored = await activityCursorsRepo.get(db, CONSUMER);
      return stored !== null && stored.id === pruned.id;
    });
    await stopAll();
    start();
    await sleep(250);
    expect(resyncs).toHaveLength(1);
  });
});

describe("repairRestoredActivityXidsEffect", () => {
  const FUTURE = "9000000000000000000";

  beforeEach(async () => {
    await resetTestDb();
  });

  it("leaves a healthy log untouched", async () => {
    const cased = await seedCase(db);
    const row = await append(cased.id, "ok", 1);
    expect(await runDomain(repairRestoredActivityXidsEffect())).toEqual({
      repaired: 0,
    });
    const [after] = await activityLogRepo.drain(db, { after: START, limit: 5 });
    expect(after?.xid).toBe(row.xid);
  });

  it("does nothing on an empty log", async () => {
    expect(await runDomain(repairRestoredActivityXidsEffect())).toEqual({
      repaired: 0,
    });
  });

  it("rewrites every xid to 0 when any is in the future, keeping id order, so restored rows are readable", async () => {
    const cased = await seedCase(db);
    const early = await append(cased.id, "early", 3);
    const late = await append(cased.id, "late", 2);
    await client`UPDATE activity SET xid = ${FUTURE}::xid8 WHERE id = ${late.id}`;
    // Held back before the repair: a future xid is never commit-safe.
    expect(await labels()).toEqual(["early"]);
    await activityFloorRepo.raise(db, { xid: FUTURE, id: early.id });
    await activityCursorsRepo.set(db, "worker", { xid: FUTURE, id: late.id });

    expect(await runDomain(repairRestoredActivityXidsEffect())).toEqual({
      repaired: 2,
    });
    expect(await labels()).toEqual(["early", "late"]);
    const rows = await activityLogRepo.drain(db, { after: START, limit: 10 });
    expect(rows.map((row) => row.xid)).toEqual(["0", "0"]);
    expect(await activityFloorRepo.get(db)).toEqual({
      xid: "0",
      id: early.id,
    });
    expect(await activityCursorsRepo.get(db, "worker")).toEqual({
      xid: "0",
      id: late.id,
    });
    // Idempotent: the next boot finds nothing to do.
    expect(await runDomain(repairRestoredActivityXidsEffect())).toEqual({
      repaired: 0,
    });
  });
});
