import { sql } from "drizzle-orm";
import { vi } from "vitest";

import { db, type DbExec } from "@watchdog/db";

type Procedure = (...args: never[]) => unknown;

/** The keys of `T` that hold a function: what a pause point can wrap. */
type MethodKey<T> = {
  [K in keyof T & string]: T[K] extends Procedure ? K : never;
}[keyof T & string];

export type TwoWritersOptions = {
  /** The named point where writer A parks until writer B has run (or is blocked on A). */
  pauseAt: string;
  /** Handle used to look for lock waiters; the shared test pool by default. */
  exec?: DbExec;
  /** How long to wait for A to reach the point and for B to settle or block. Default 10 s. */
  timeoutMs?: number;
};

export type TwoWritersOutcome<A, B> = {
  a: PromiseSettledResult<A>;
  b: PromiseSettledResult<B>;
  /**
   * True when B was waiting on a lock when A resumed: A held B off, so B's work could only
   * land after A finished. False when B ran to completion inside A's window.
   */
  bBlocked: boolean;
};

export type TwoWriters = {
  /**
   * Mark that the calling writer is at `point`. The first caller of the race's `pauseAt` point
   * parks there until the other writer has run; any other caller or point passes straight
   * through. Call it from code you can edit (a writer that owns its transaction); for
   * production code use `pauseAfter` or `pauseBefore`.
   */
  reach: (point: string) => Promise<void>;
  /** Wrap `target[method]` so that `point` is reached right after the real call returns. */
  pauseAfter: <T extends object>(
    target: T,
    method: MethodKey<T>,
    point: string
  ) => void;
  /** Wrap `target[method]` so that `point` is reached right before the real call. */
  pauseBefore: <T extends object>(
    target: T,
    method: MethodKey<T>,
    point: string
  ) => void;
  /**
   * Run A to the point, then B until it settles or blocks on A, then let A finish.
   * Never throws for a writer's own failure: both results are returned, so a test asserts which
   * writer lost and how. It throws when A settles before the point or the timeout passes.
   */
  run: <A, B>(writers: {
    a: () => Promise<A>;
    b: () => Promise<B>;
  }) => Promise<TwoWritersOutcome<A, B>>;
};

/**
 * The backends of this database idle in their transaction right now. Called while writer A is
 * parked, so A is among them: a parked writer has no statement running. Other writers have none
 * yet (B has not started), and a stranger that is mid-statement is not idle.
 */
async function parkedBackendPids(exec: DbExec): Promise<number[]> {
  const rows = await exec.execute<{ pid: number }>(sql`
    select pid from pg_stat_activity
    where datname = current_database() and state = 'idle in transaction'`);
  return rows.map((row) => row.pid);
}

/**
 * Backends of this database that wait on a lock one of `holders` (the backends parked when A
 * reached the point) holds. A waiter blocked by anything else (another statement still running,
 * an unrelated session, even one that is idle in its transaction for an instant between two
 * statements) does not count: that blocker is not in `holders`.
 */
async function countBlockedBackends(
  exec: DbExec,
  holders: readonly number[]
): Promise<number> {
  if (holders.length === 0) return 0;
  const parked = sql.join(
    holders.map((pid) => sql`${pid}`),
    sql`, `
  );
  const rows = await exec.execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database()
      and wait_event_type = 'Lock'
      and pg_blocking_pids(pid) && array[${parked}]::int[]`);
  return rows[0]?.n ?? 0;
}

type Latch = { readonly opened: Promise<void>; readonly open: () => void };

function latch(): Latch {
  const resolvers: (() => void)[] = [];
  // oxlint-disable-next-line promise/avoid-new -- a latch has no library promise to return
  const opened = new Promise<void>((resolve) => {
    resolvers.push(resolve);
  });
  return {
    opened,
    open: () => {
      for (const resolve of resolvers) resolve();
    },
  };
}

/** A writer's result as data, so its failure is never an unhandled rejection. */
async function settle<T>(
  writer: () => Promise<T>,
  done: { value: boolean }
): Promise<PromiseSettledResult<T>> {
  try {
    return { status: "fulfilled", value: await writer() };
  } catch (error) {
    return { status: "rejected", reason: error };
  } finally {
    done.value = true;
  }
}

/**
 * A two-writer race with controlled interleaving, for a state transition that must hold under
 * READ COMMITTED. Writer A runs to a named point, writer B runs, then A continues:
 *
 * ```ts
 * const race = twoWriters({ pauseAt: "locked" });
 * race.pauseAfter(proposalsRepo, "lockInCase", "locked");
 * const { a, b, bBlocked } = await race.run({
 *   a: () => runDomain(acceptProposalEffect(input)),
 *   b: () => runDomain(rejectProposalEffect(input)),
 * });
 * ```
 *
 * B is given every chance to finish while A is parked: `run` resumes A only once B has settled
 * or is waiting on a lock (`pg_blocking_pids`) that a backend parked at the point holds, so there
 * is no sleep and no timing guess. A guard that works makes B block (`bBlocked`) and fail or
 * no-op after A commits; a missing guard lets B finish inside A's window and the test sees the
 * lost update. The wrapped methods
 * are restored when `run` returns.
 */
export function twoWriters(options: TwoWritersOptions): TwoWriters {
  const exec = options.exec ?? db;
  const timeout = options.timeoutMs ?? 10_000;
  const restores: (() => void)[] = [];
  const releaseLatch = latch();
  let parked = false;

  const reach = async (point: string): Promise<void> => {
    if (point !== options.pauseAt || parked) return;
    parked = true;
    await releaseLatch.opened;
  };

  const wrap = <T extends object>(
    target: T,
    method: MethodKey<T>,
    point: string,
    when: "before" | "after"
  ): void => {
    const real: unknown = target[method];
    if (typeof real !== "function") {
      throw new TypeError(`twoWriters: ${method} is not a function`);
    }
    const original = Object.getOwnPropertyDescriptor(target, method);
    const wrapper = async (...args: unknown[]): Promise<unknown> => {
      if (when === "before") await reach(point);
      const result: unknown = await Reflect.apply(real, target, args);
      if (when === "after") await reach(point);
      return result;
    };
    Object.defineProperty(target, method, {
      value: wrapper,
      configurable: true,
      writable: true,
      enumerable: original?.enumerable ?? true,
    });
    restores.push(() => {
      if (original === undefined) Reflect.deleteProperty(target, method);
      else Object.defineProperty(target, method, original);
    });
  };

  const run = async <A, B>(writers: {
    a: () => Promise<A>;
    b: () => Promise<B>;
  }): Promise<TwoWritersOutcome<A, B>> => {
    const started: Promise<unknown>[] = [];
    try {
      const aDone = { value: false };
      const a = settle(writers.a, aDone);
      started.push(a);
      await vi.waitFor(
        () => {
          if (parked) return;
          throw new Error(
            aDone.value
              ? `twoWriters: writer A settled without reaching "${options.pauseAt}"`
              : `twoWriters: writer A never reached "${options.pauseAt}"`
          );
        },
        { timeout, interval: 5 }
      );

      // A is parked, so its backend (if it holds a transaction) is idle in it: remember who is
      // parked now, and count only waiters that A's backend holds off.
      const holders = await parkedBackendPids(exec);
      const bDone = { value: false };
      const b = settle(writers.b, bDone);
      started.push(b);
      let bBlocked = false;
      await vi.waitFor(
        async () => {
          if (bDone.value) return;
          if ((await countBlockedBackends(exec, holders)) > 0) {
            bBlocked = true;
            return;
          }
          throw new Error("twoWriters: B has neither settled nor blocked");
        },
        { timeout, interval: 5 }
      );

      releaseLatch.open();
      return { a: await a, b: await b, bBlocked };
    } finally {
      // On a timeout a writer may still be parked or running: release it and wait for it, so
      // no transaction outlives the run and writes into the next test's reset database.
      releaseLatch.open();
      const bound = latch();
      const timer = setTimeout(bound.open, timeout);
      await Promise.race([Promise.allSettled(started), bound.opened]);
      clearTimeout(timer);
      for (const restore of restores.splice(0)) restore();
    }
  };

  return {
    reach,
    pauseAfter: (target, method, point) => {
      wrap(target, method, point, "after");
    },
    pauseBefore: (target, method, point) => {
      wrap(target, method, point, "before");
    },
    run,
  };
}
