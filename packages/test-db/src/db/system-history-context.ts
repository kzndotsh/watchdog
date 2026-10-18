import { sql } from "drizzle-orm";

import { setGraphHistoryContext, type DbExec, type DbTx } from "@watchdog/db";

/**
 * Run `fn` with the explicit `system` history context (no actor): the one way a seed or a
 * repository-level test writes Graph rows directly. The application role (what the tests connect
 * as) is refused a Graph write with no context (issue #352), and the test harness
 * (`withTestTx`) sets no default one on purpose: a core write path that forgets
 * `setHistoryContextEffect` must fail its own tests.
 *
 * Opens a transaction on a pool and a savepoint inside a `tx`; the context is set for `fn` only
 * and the previous settings are restored after it, so a seed never leaves a context behind for
 * the code under test. Pass the `tx` it gives you to the repos.
 */
export async function withSystemHistoryContext<T>(
  exec: DbExec,
  fn: (tx: DbTx) => Promise<T>
): Promise<T> {
  return exec.transaction(async (tx) => {
    const [before] = await tx.execute<Record<string, string | null>>(sql`select
      current_setting('watchdog.actor_id', true) as actor_id,
      current_setting('watchdog.actor_label', true) as actor_label,
      current_setting('watchdog.channel', true) as channel`);
    await setGraphHistoryContext(tx, { channel: "system" });
    const result = await fn(tx);
    await tx.execute(sql`select
      set_config('watchdog.actor_id', ${before?.actor_id ?? ""}, true),
      set_config('watchdog.actor_label', ${before?.actor_label ?? ""}, true),
      set_config('watchdog.channel', ${before?.channel ?? ""}, true)`);
    return result;
  });
}
