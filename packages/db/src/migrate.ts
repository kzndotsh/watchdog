import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { APP_ROLE, applyAppRoleGrants } from "./app-role";
import { installJobQueueSchema } from "./job-queue-schema";

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
 * Apply the pending migrations in `migrationsFolder` (the `packages/db/drizzle` layout that
 * `drizzle-kit generate` writes, with the same `drizzle.__drizzle_migrations` bookkeeping as
 * `drizzle-kit migrate`) under the advisory lock, then, still under it and as the same (owner)
 * role: install or upgrade pg-boss's schema, and re-apply the application role's grants and the
 * audit-table revocations (`applyAppRoleGrants`; skipped when the role does not exist). Throws
 * when a migration fails; the failed one is rolled back and nothing after it runs.
 */
export async function runMigrations(options: {
  readonly url: string;
  readonly migrationsFolder: string;
  /** The application role to grant to; defaults to `APP_ROLE`. Tests use their own. */
  readonly appRole?: string;
}): Promise<{ readonly appRoleGranted: boolean }> {
  const sql = postgres(options.url, { max: 1, onnotice: () => {} });
  try {
    return await withMigrationLock(sql, async () => {
      await migrate(drizzle(sql), {
        migrationsFolder: options.migrationsFolder,
      });
      await installJobQueueSchema(options.url);
      const { applied } = await applyAppRoleGrants(
        sql,
        options.appRole ?? APP_ROLE
      );
      return { appRoleGranted: applied };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
