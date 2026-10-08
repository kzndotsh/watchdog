import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function until(check: () => boolean, timeoutMs = 4000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition not met in time");
    // oxlint-disable-next-line eslint/no-await-in-loop
    await sleep(10);
  }
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
    await start();

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
      await sleep(250);
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
    await start();

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
      await sleep(250);
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
    await sleep(300);
    expect(seen.map((row) => row.label)).toEqual(["only once"]);
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
    await start({
      holdBackWarnMs: 100,
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
      await sleep(200);
      expect(held).toHaveLength(1);
    } finally {
      release();
      await older;
    }
  });

  it("stops delivering and ends LISTEN once the last subscriber leaves", async () => {
    const cased = await seedCase(db);
    let ended = 0;
    const subscription = await start({
      listen: () => ({
        end: async () => {
          ended += 1;
        },
      }),
      pollMs: 20,
    });
    await append(cased.id, "while subscribed");
    await until(() => seen.length === 1);
    subscription.unsubscribe();
    await until(() => ended === 1);
    await append(cased.id, "after unsubscribe");
    await sleep(150);
    expect(seen).toHaveLength(1);
  });
});
