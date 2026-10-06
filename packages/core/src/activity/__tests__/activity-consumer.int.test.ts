import { Deferred, Effect, Exit, Fiber } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  runActivityConsumerEffect,
  type ActivityConsumerOpts,
} from "@watchdog/core/activity";
import { createEntityEffect } from "@watchdog/core/graph";
import { Db, runDomain } from "@watchdog/core/infra";
import { createTaskEffect } from "@watchdog/core/tasks";
import {
  activityCursorsRepo,
  activityLogRepo,
  db,
  type ActivityRow,
} from "@watchdog/db";
import type { ActivityCursor, ActivityEntry } from "@watchdog/schemas/feed";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";

const CONSUMER = "test-consumer";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function untilAsync(
  check: () => Promise<boolean>,
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

async function until(check: () => boolean, timeoutMs = 4000): Promise<void> {
  await untilAsync(() => Promise.resolve(check()), timeoutMs);
}

async function append(caseId: CaseId, label: string): Promise<ActivityRow> {
  const row = await activityLogRepo.append(db, {
    caseId,
    kind: "task",
    action: "created",
    label,
  });
  if (row === null) throw new Error("append failed");
  return row;
}

function cursorOf(row: ActivityRow): ActivityCursor {
  return { xid: row.xid, id: row.id };
}

function stored() {
  return activityCursorsRepo.get(db, CONSUMER);
}

/** Wait until the stored cursor equals the log head. */
async function untilStoredAtHead(): Promise<ActivityCursor> {
  await untilAsync(async () => {
    const [cursor, head] = [await stored(), await activityLogRepo.head(db)];
    return cursor !== null && cursor.xid === head.xid && cursor.id === head.id;
  });
  const cursor = await stored();
  if (cursor === null) throw new Error("no cursor");
  return cursor;
}

describe("runActivityConsumerEffect", () => {
  const running: Fiber.Fiber<unknown, unknown>[] = [];
  const handled: string[] = [];
  const resyncs: (readonly CaseId[])[] = [];

  function start(overrides: Partial<ActivityConsumerOpts> = {}) {
    const fiber = Effect.runFork(
      runActivityConsumerEffect({
        consumer: CONSUMER,
        handle: (entry: ActivityEntry) =>
          Effect.sync(() => {
            handled.push(entry.label ?? "");
          }),
        onResync: (caseIds) =>
          Effect.sync(() => {
            resyncs.push(caseIds);
          }),
        ...overrides,
      }).pipe(Effect.provide(Db.layer))
    );
    running.push(fiber);
    return fiber;
  }

  async function stop(fiber: Fiber.Fiber<unknown, unknown>) {
    await Effect.runPromise(Fiber.interrupt(fiber));
  }

  beforeEach(async () => {
    await resetTestDb();
    handled.length = 0;
    resyncs.length = 0;
  });

  afterEach(async () => {
    await Promise.all(running.splice(0).map((fiber) => stop(fiber)));
  });

  it("starts at the head on a first boot: history is not replayed, the cursor is stored", async () => {
    const cased = await seedCase(db);
    const last = await append(cased.id, "before the first boot");
    start();
    expect(await untilStoredAtHead()).toEqual(cursorOf(last));
    await sleep(100);
    expect(handled).toEqual([]);
    await append(cased.id, "live after boot");
    await until(() => handled.length === 1);
    expect(handled).toEqual(["live after boot"]);
    expect(resyncs).toEqual([]);
  });

  it("catches up on entries written while it was down, in order, then goes live", async () => {
    const cased = await seedCase(db);
    const seen = await append(cased.id, "seen");
    await activityCursorsRepo.set(db, CONSUMER, cursorOf(seen));
    await append(cased.id, "down one");
    await append(cased.id, "down two");
    start();
    await until(() => handled.length === 2);
    expect(handled).toEqual(["down one", "down two"]);
    await append(cased.id, "live");
    await until(() => handled.length === 3);
    expect(handled.at(-1)).toBe("live");
    expect(resyncs).toEqual([]);
  });

  it("catches up on real domain writes made while it was down", async () => {
    const cased = await seedCase(db);
    const first = start();
    await untilAsync(async () => (await stored()) !== null);
    await stop(first);

    const base = { caseId: cased.id, organizationId: TEST_ORGANIZATION_ID };
    await runDomain(
      createEntityEffect({
        ...base,
        kind: "person",
        name: "Grace Hopper",
        slug: "grace",
      })
    );
    await runDomain(createTaskEffect({ ...base, title: "Call her" }));
    start();
    await until(() => handled.length >= 2);
    expect(handled).toContain("Grace Hopper");
    expect(handled).toContain("Call her");
    await untilStoredAtHead();
  });

  it("keeps its cursor across a restart: handled entries are not handled again", async () => {
    const cased = await seedCase(db);
    const first = start();
    await untilAsync(async () => (await stored()) !== null);
    await append(cased.id, "first run");
    await until(() => handled.length === 1);
    await untilStoredAtHead();
    await stop(first);

    await append(cased.id, "while down");
    handled.length = 0;
    start();
    await until(() => handled.length === 1);
    await sleep(150);
    expect(handled).toEqual(["while down"]);
    await untilStoredAtHead();
  });

  it("advances the cursor only after the entry was handled", async () => {
    const cased = await seedCase(db);
    const before = await append(cased.id, "before");
    await activityCursorsRepo.set(db, CONSUMER, cursorOf(before));
    const pending = await append(cased.id, "slow handler");
    const entered = Deferred.makeUnsafe<undefined>();
    const release = Deferred.makeUnsafe<undefined>();
    start({
      handle: () =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Deferred.await(release))
        ),
    });
    await Effect.runPromise(Deferred.await(entered));
    await sleep(150);
    expect(await stored()).toEqual(cursorOf(before));
    await Effect.runPromise(Deferred.succeed(release, undefined));
    await untilAsync(
      async () =>
        JSON.stringify(await stored()) === JSON.stringify(cursorOf(pending))
    );
  });

  it("does not advance past an entry whose handler died", async () => {
    const cased = await seedCase(db);
    const before = await append(cased.id, "before");
    await activityCursorsRepo.set(db, CONSUMER, cursorOf(before));
    await append(cased.id, "poison");
    const fiber = start({
      handle: () => Effect.die(new Error("handler broke")),
    });
    const exit = await Effect.runPromise(Fiber.await(fiber));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(await stored()).toEqual(cursorOf(before));
  });

  it("treats a cursor ahead of the database as a resync: a full scan, then the head", async () => {
    const one = await seedCase(db, { slug: "one" });
    const two = await seedCase(db, { slug: "two" });
    await append(one.id, "only entry");
    await activityCursorsRepo.set(db, CONSUMER, {
      xid: "18446744073709551000",
      id: 99_999,
    });
    start();
    await until(() => resyncs.length === 1);
    expect([...(resyncs[0] ?? [])].sort()).toEqual([one.id, two.id].sort());
    // The stale cursor is replaced by the head; nothing is replayed.
    await untilStoredAtHead();
    expect(handled).toEqual([]);
    await append(one.id, "after the resync");
    await until(() => handled.length === 1);
    expect(handled).toEqual(["after the resync"]);
  });

  it("treats a stored cursor on an emptied log as a resync", async () => {
    const one = await seedCase(db, { slug: "one" });
    await activityCursorsRepo.set(db, CONSUMER, { xid: "500", id: 40 });
    start();
    await until(() => resyncs.length === 1);
    expect(resyncs[0]).toEqual([one.id]);
    await untilAsync(
      async () => JSON.stringify(await stored()) === '{"xid":"0","id":0}'
    );
  });
});
