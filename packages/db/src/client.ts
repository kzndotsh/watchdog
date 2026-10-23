import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@watchdog/env/server";

import * as schema from "./schema/index";

/** The main pool: the postgres.js client and the Drizzle handle over it. */
export type Pool = {
  readonly client: ReturnType<typeof postgres>;
  readonly db: ReturnType<typeof drizzle<typeof schema>>;
};

/**
 * Seconds `endPool` waits for in-flight queries before it closes the sockets.
 * Bounded so a stuck query cannot hold a shutdown (or an HMR reload) forever.
 */
export const POOL_END_TIMEOUT_SECONDS = 5;

/**
 * Vite / tsx watch re-evaluate this module on HMR. Without a process-global
 * singleton each reload opens another pool (max: 10) and never ends the old
 * one → Postgres 53300. Keep one pool per process; `endPool` ends it and clears
 * the slot, so the next `acquirePool` opens a fresh one instead of handing out
 * a dead client.
 */
const globalForDb = globalThis as typeof globalThis & {
  __watchdogPool?: Pool;
};

/** Connections in the process's Postgres pool (the worker sizes its lane slots against it). */
export const POOL_MAX = 10;

/** A new pool over `connectionString`, outside the process-global slot (tests, tools). */
export function createPool(connectionString: string): Pool {
  const client = postgres(connectionString, {
    max: POOL_MAX,
    // Close unused sockets so a rare leak cannot pin max_connections forever.
    idle_timeout: 20,
    max_lifetime: 60 * 30,
  });
  return { client, db: drizzle(client, { schema }) };
}

/**
 * The process's one pool, opened on first use (postgres.js connects on the first
 * query). Production code never calls this: the `Db` owner Layer in
 * `@watchdog/core` does (`pnpm lint` bans the import elsewhere).
 */
export function acquirePool(): Pool {
  globalForDb.__watchdogPool ??= createPool(env.DATABASE_URL);
  return globalForDb.__watchdogPool;
}

/**
 * End `pool` (default: the process pool) and, when it is the process pool,
 * clear the slot. Waits up to `timeoutSeconds` for in-flight queries.
 * Idempotent: ending an ended pool is a no-op.
 */
export async function endPool(
  pool: Pool | undefined = globalForDb.__watchdogPool,
  timeoutSeconds: number = POOL_END_TIMEOUT_SECONDS
): Promise<void> {
  if (pool === undefined) return;
  if (globalForDb.__watchdogPool === pool) {
    globalForDb.__watchdogPool = undefined;
  }
  await pool.client.end({ timeout: timeoutSeconds });
}

/**
 * Run `work` with the process pool and end it afterwards: the owner of a
 * one-shot process entry (first-admin and vault-rekey commands).
 */
export async function withPool<A>(
  work: (pool: Pool) => Promise<A>
): Promise<A> {
  const pool = acquirePool();
  try {
    return await work(pool);
  } finally {
    await endPool(pool);
  }
}

/**
 * The process pool's handles, bound at import: for tests and `@watchdog/test-db`
 * only (production code is lint-banned from importing them; see `acquirePool`).
 */
export const { client, db } = acquirePool();

export type Db = Pool["db"];
