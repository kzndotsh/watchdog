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
    // A session outside the race: one statement takes the lock and keeps running, so the session
    // is never idle in its transaction until the statement ends and the transaction commits.
    const stranger = testDb.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(7102), pg_sleep(1)`);
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

    const outcome = await race.run({
      a: async () => {
        await strangerHolds;
        await race.reach("parked");
      },
      b: () =>
        testDb.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(7102)`);
        }),
    });
    await stranger;

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
