import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** The one thing the lock needs from a postgres.js client: tagged-template queries. */
export type LockClient = (
  strings: TemplateStringsArray,
  ...params: readonly string[]
) => Promise<unknown>;

/**
 * Session advisory lock key shared by every migrating process ("WDMIGRAT" as bytes), so two
 * replicas starting together apply the pending migrations one after the other, never at once.
 */
export const MIGRATION_LOCK_KEY = 0x57_44_4d_49_47_52_41_54n;

/**
 * Run `run` while holding the migration lock on `sql`'s connection. The lock is per session:
 * `sql` must be a single-connection client, otherwise the unlock could land on another one.
 * A second caller blocks until the first has finished, then finds nothing left to apply.
 */
export async function withMigrationLock<T>(
  sql: LockClient,
  run: () => Promise<T>
): Promise<T> {
  const key = MIGRATION_LOCK_KEY.toString();
  await sql`select pg_advisory_lock(${key}::bigint)`;
  try {
    return await run();
  } finally {
    // Ending the session releases the lock too, so a failed unlock must not hide `run`'s outcome.
    await sql`select pg_advisory_unlock(${key}::bigint)`.catch(() => null);
  }
}

/**
 * The message worth showing for a failed migration. drizzle wraps a database error in one whose
 * message is the statement that failed (a whole migration file), and the database's own message
 * (a constraint name, or the report migration's list of offending rows) sits in `cause`.
 */
export function migrationFailureMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  let deepest: Error = error;
  while (deepest.cause instanceof Error) deepest = deepest.cause;
  return deepest.message;
}

/**
 * Apply the pending migrations in `migrationsFolder` (the `packages/db/drizzle` layout that
 * `drizzle-kit generate` writes, with the same `drizzle.__drizzle_migrations` bookkeeping as
 * `drizzle-kit migrate`) under the advisory lock. Throws when a migration fails; the failed one
 * is rolled back and nothing after it runs.
 */
export async function runMigrations(options: {
  readonly url: string;
  readonly migrationsFolder: string;
}): Promise<void> {
  const sql = postgres(options.url, { max: 1, onnotice: () => {} });
  try {
    await withMigrationLock(sql, () =>
      migrate(drizzle(sql), { migrationsFolder: options.migrationsFolder })
    );
  } finally {
    await sql.end({ timeout: 5 });
  }
}
