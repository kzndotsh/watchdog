import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { testDb } from "../../test-db";
import { twoWriters } from "../two-writers";

describe("twoWriters", () => {
  it("reports B as blocked when it waits on a lock A holds while parked", async () => {
    const race = twoWriters({ pauseAt: "locked" });

    const outcome = await race.run({
      a: () =>
        testDb.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(7101)`);
          await race.reach("locked");
        }),
      b: () =>
        testDb.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(7101)`);
        }),
    });

    expect(outcome.bBlocked).toBe(true);
    expect(outcome.a.status).toBe("fulfilled");
    expect(outcome.b.status).toBe("fulfilled");
  });

  it("does not count a waiter that an unrelated running statement blocks", async () => {
    const race = twoWriters({ pauseAt: "parked" });
    // A session outside the race: one statement takes 7102, then polls for 7103, which a gate holds
    // until B is seen waiting on 7102. The statement keeps running the whole time, so the stranger
    // is never idle in its transaction while B waits on it, and no timer decides when it lets go:
    // B then takes 7102 and settles while A is still parked, as the run requires. It polls
    // (`pg_try_…` plus a short sleep) rather than waiting on 7103, because a lock wait on the gate,
    // which is idle in its transaction when A parks, would itself count as a blocked waiter.
    let gateHeld: () => void = () => {};
    let openGate: () => void = () => {};
    // oxlint-disable-next-line promise/avoid-new -- the gate's lock is taken before the stranger starts
    const held = new Promise<void>((resolve) => {
      gateHeld = resolve;
    });
    // oxlint-disable-next-line promise/avoid-new -- the test opens the gate once A is released
    const opened = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const gate = testDb.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7103)`);
      gateHeld();
      await opened;
    });
    await held;
    const stranger = testDb.transaction(async (tx) => {
      await tx.execute(sql`
        do $$ begin
          perform pg_advisory_xact_lock(7102);
          while not pg_try_advisory_xact_lock(7103) loop
            perform pg_sleep(0.005);
          end loop;
        end $$`);
    });
    const strangerHolds = vi.waitFor(
      async () => {
        const rows = await testDb.execute<{ n: number }>(sql`
          select count(*)::int as n from pg_locks
          where locktype = 'advisory' and objid = 7102 and granted`);
        if (rows[0]?.n !== 1)
          throw new Error("the stranger does not hold 7102");
      },
      { timeout: 10_000, interval: 5 }
    );
    const bWaitsOnStranger = () =>
      vi.waitFor(
        async () => {
          const rows = await testDb.execute<{ n: number }>(sql`
            select count(*)::int as n from pg_locks
            where locktype = 'advisory' and objid = 7102 and not granted`);
          if (rows[0]?.n !== 1) throw new Error("B does not wait on 7102");
        },
        { timeout: 10_000, interval: 5 }
      );

    const outcome = await race
      .run({
        a: async () => {
          await strangerHolds;
          const opener = bWaitsOnStranger().then(openGate);
          await race.reach("parked");
          await opener;
        },
        b: () =>
          testDb.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(7102)`);
          }),
      })
      .finally(openGate);
    await Promise.all([stranger, gate]);

    expect(outcome.bBlocked).toBe(false);
    expect(outcome.b.status).toBe("fulfilled");
  });

  it("has settled both writers before a timed-out run rejects", async () => {
    const race = twoWriters({ pauseAt: "parked", timeoutMs: 200 });
    const finished = { a: false, b: false };
    let aEnded: () => void = () => {};
    // oxlint-disable-next-line promise/avoid-new -- B waits for A's end, which the run only causes by releasing A
    const aEnd = new Promise<void>((resolve) => {
      aEnded = resolve;
    });

    // B neither settles nor blocks on a lock until A is released, so the wait for B times out.
    await expect(
      race.run({
        a: async () => {
          await race.reach("parked");
          finished.a = true;
          aEnded();
        },
        b: async () => {
          await aEnd;
          finished.b = true;
        },
      })
    ).rejects.toThrow("neither settled nor blocked");

    expect(finished).toEqual({ a: true, b: true });
  });
});
