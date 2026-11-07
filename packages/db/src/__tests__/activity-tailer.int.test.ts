import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CaseId } from "@watchdog/schemas/shared";
import { resetTestDb, seedCase } from "@watchdog/test-db";

import {
  createActivityTailer,
  type ActivityTailer,
} from "../activity-tailer.ts";
import { db } from "../client.ts";
import {
  activityLogRepo,
  type ActivityRow,
} from "../repos/activity-log.repo.ts";

const FAST = { pollMs: 5000, repollMs: 20 } as const;

function until(check: () => boolean, timeoutMs = 4000) {
  return vi.waitFor(
    () => {
      if (!check()) throw new Error("condition not met in time");
    },
    { timeout: timeoutMs, interval: 10 }
  );
}

describe("createActivityTailer", () => {
  let tailer: ActivityTailer | undefined;
  const seen: ActivityRow[] = [];

  beforeEach(async () => {
    await resetTestDb();
    seen.length = 0;
  });

  afterEach(async () => {
    await tailer?.stop();
    tailer = undefined;
    vi.restoreAllMocks();
  });

  async function start(
    options: Partial<Parameters<typeof createActivityTailer>[0]> = {}
  ) {
    tailer = createActivityTailer({ exec: db, ...FAST, ...options });
    const subscription = tailer.subscribe((row) => {
      seen.push(row);
    });
    await subscription.ready;
    return subscription;
  }

  async function append(caseId: CaseId, label: string) {
    return activityLogRepo.append(db, {
      caseId,
      kind: "task",
      action: "created",
      label,
    });
  }

  it("delivers entries committed after it started, in order, on the NOTIFY wake-up", async () => {
    const cased = await seedCase(db);
    await append(cased.id, "before the tailer");
    await start();
    // pollMs is 5 s, so a prompt delivery proves the wake-up path.
    await append(cased.id, "one");
    await append(cased.id, "two");
    await until(() => seen.length >= 2, 2000);
    expect(seen.map((row) => row.label)).toEqual(["one", "two"]);
  });

  it("never skips a row when the higher id commits first", async () => {
    const cased = await seedCase(db);
    // `holdBackWarnMs: 0` makes the first drain that finds rows held back report it: the
    // rendezvous that shows the tailer has looked at the log and delivered nothing.
    const heldBack: number[] = [];
    await start({
      holdBackWarnMs: 0,
      onHeldBack: (ms) => {
        heldBack.push(ms);
      },
    });

    // T1 takes the lower id and stays open; T2 takes the higher id and commits first.
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted: () => void = () => {};
    const insertedRow = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const older = db.transaction(async (tx) => {
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "T1 (lower id, commits last)",
      });
      inserted();
      await held;
    });
    try {
      await insertedRow;
      await append(cased.id, "T2 (higher id, commits first)");
      // T2 has committed but an older transaction is open: it must be held back.
      await until(() => heldBack.length > 0);
      expect(seen).toEqual([]);
    } finally {
      release();
      await older;
    }
    await until(() => seen.length >= 2);
    expect(seen.map((row) => row.label)).toEqual([
      "T1 (lower id, commits last)",
      "T2 (higher id, commits first)",
    ]);
  });

  it("delivers both rows when the lower xid carries the higher id", async () => {
    const cased = await seedCase(db);
    const heldBack: number[] = [];
    await start({
      holdBackWarnMs: 0,
      onHeldBack: (ms) => {
        heldBack.push(ms);
      },
    });

    // L takes the lower xid first (no row yet); H then inserts (xid higher, id lower);
    // L inserts afterwards (xid lower, id higher). H commits first.
    let releaseL: () => void = () => {};
    const heldL = new Promise<void>((resolve) => {
      releaseL = resolve;
    });
    let lowXid: () => void = () => {};
    const lowXidTaken = new Promise<void>((resolve) => {
      lowXid = resolve;
    });
    const low = db.transaction(async (tx) => {
      await tx.execute(sql`select pg_current_xact_id()`);
      lowXid();
      await heldL;
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "L (lower xid, higher id)",
      });
    });
    try {
      await lowXidTaken;
      await append(cased.id, "H (higher xid, lower id)");
      await until(() => heldBack.length > 0);
      expect(seen).toEqual([]);
    } finally {
      releaseL();
      await low;
    }
    await until(() => seen.length >= 2);
    expect(new Set(seen.map((row) => row.label))).toEqual(
      new Set(["L (lower xid, higher id)", "H (higher xid, lower id)"])
    );
    // Delivery is xid order, which here differs from id order.
    expect(seen.map((row) => row.label)).toEqual([
      "L (lower xid, higher id)",
      "H (higher xid, lower id)",
    ]);
  });

  it("starts after a supplied cursor and delivers the rows already past it", async () => {
    const cased = await seedCase(db);
    const first = await append(cased.id, "handled before the restart");
    await append(cased.id, "written while down one");
    await append(cased.id, "written while down two");
    if (first === null) throw new Error("append failed");
    await start({ startAt: { xid: first.xid, id: first.id } });
    await until(() => seen.length >= 2, 2000);
    expect(seen.map((row) => row.label)).toEqual([
      "written while down one",
      "written while down two",
    ]);
    await append(cased.id, "live");
    await until(() => seen.length >= 3, 2000);
    expect(seen.map((row) => row.label).at(-1)).toBe("live");
  });

  it("reports a LISTEN failure to onListenError and keeps drain errors on onError", async () => {
    const listenFailures: unknown[] = [];
    const errors: unknown[] = [];
    const failure = new Error("listen failed");
    await start({
      pollMs: 5000,
      listen: (_wake, _ready, onError) => {
        onError(failure);
        return { end: async () => {} };
      },
      onListenError: (error) => {
        listenFailures.push(error);
      },
      onError: (error) => {
        errors.push(error);
      },
    });
    expect(listenFailures).toEqual([failure]);
    expect(errors).toEqual([]);
  });

  it("delivers a row once even when a wake-up and the poll both fire", async () => {
    const cased = await seedCase(db);
    await start({ pollMs: 20 });
    await append(cased.id, "only once");
    // A sentinel after it: a second delivery of "only once" would arrive before the sentinel.
    await append(cased.id, "sentinel");
    await until(() => seen.some((row) => row.label === "sentinel"));
    expect(seen.map((row) => row.label)).toEqual(["only once", "sentinel"]);
  });

  it("falls back to the poll when LISTEN never wakes it", async () => {
    const cased = await seedCase(db);
    await start({
      pollMs: 30,
      listen: () => ({ end: async () => {} }),
    });
    await append(cased.id, "found by the poll");
    await until(() => seen.length === 1, 2000);
    expect(seen[0]?.label).toBe("found by the poll");
  });

  it("warns once when an open transaction holds rows back", async () => {
    const cased = await seedCase(db);
    const held: number[] = [];
    const drains = vi.spyOn(activityLogRepo, "drain");
    await start({
      holdBackWarnMs: 0,
      onHeldBack: (ms) => {
        held.push(ms);
      },
    });
    let release: () => void = () => {};
    const block = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inserted: () => void = () => {};
    const insertedRow = new Promise<void>((resolve) => {
      inserted = resolve;
    });
    const older = db.transaction(async (tx) => {
      await activityLogRepo.append(tx, {
        caseId: cased.id,
        kind: "task",
        action: "created",
        label: "open",
      });
      inserted();
      await block;
    });
    try {
      await insertedRow;
      await append(cased.id, "waiting");
      await until(() => held.length > 0, 2000);
      // The tailer keeps re-polling while the transaction is open (`repollMs`): let it poll
      // five more times, counted rather than timed, and it must not have warned again.
      const polled = drains.mock.calls.length;
      await until(() => drains.mock.calls.length >= polled + 5, 2000);
      expect(held).toHaveLength(1);
    } finally {
      release();
      await older;
    }
  });

  it("stops delivering and ends LISTEN once the last subscriber leaves", async () => {
    const cased = await seedCase(db);
    let ended = 0;
    let wake: (payload: string) => void = () => {};
    const drains = vi.spyOn(activityLogRepo, "drain");
    const subscription = await start({
      listen: (onNotification) => {
        wake = onNotification;
        return {
          end: async () => {
            ended += 1;
          },
        };
      },
      pollMs: 20,
    });
    await append(cased.id, "while subscribed");
    await until(() => seen.length === 1);
    subscription.unsubscribe();
    await until(() => ended === 1);
    await append(cased.id, "after unsubscribe");
    // The wake-up a live LISTEN would deliver now, and a round trip after it: a tailer that
    // still ran would have drained by then. No clock.
    await db.execute(sql`select 1`);
    const drained = drains.mock.calls.length;
    wake("{}");
    await db.execute(sql`select 1`);
    await db.execute(sql`select 1`);
    expect(drains.mock.calls.length).toBe(drained);
    expect(seen).toHaveLength(1);
  });
});
