import { TransactionRollbackError } from "drizzle-orm";
import postgres from "postgres";

import { db, type DbTx } from "@watchdog/db";

/**
 * The tests connect as the application role (`DATABASE_URL`), which cannot TRUNCATE. Wiping
 * tables is the owner's job, as in production: a small client on `DATABASE_URL_MIGRATE` (the owner
 * URL; `DATABASE_URL` for a database that is not split).
 */
let ownerClient: postgres.Sql | undefined;
function owner(): postgres.Sql {
  const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_MIGRATE or DATABASE_URL is required");
  ownerClient ??= postgres(url, {
    max: 1,
    idle_timeout: 2,
    onnotice: () => {},
  });
  return ownerClient;
}

/**
 * Wipe public Case Graph tables (keeps drizzle migrations + `auth.*`).
 * Used when a test must COMMIT (races, service-level `db.transaction`).
 * `graph_history` is append-only: its TRUNCATE guard needs the transaction to opt in, which this
 * owner-run statement does (the same opt-in `just wipe` uses).
 */
export async function resetTestDb(): Promise<void> {
  await owner().unsafe(`
    SET LOCAL watchdog.allow_history_truncate = 'on';
    DO $$
    DECLARE
      stmts text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
        || ' CASCADE'
      INTO stmts
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE '__drizzle%';
      IF stmts IS NOT NULL THEN
        EXECUTE stmts;
      END IF;
    END $$;
  `);
}

/**
 * Wipe public + Better Auth (`auth.*`) for Playwright.
 * Each e2e signup must be a true first-user bootstrap; leaving orgs across
 * tests leaves later users without membership → oRPC Forbidden.
 * Do not use from integration tests — those keep `auth.*` via `seedAuthUser`.
 */
export async function resetE2eDb(): Promise<void> {
  await owner().unsafe(`
    SET LOCAL watchdog.allow_history_truncate = 'on';
    DO $$
    DECLARE
      stmts text;
    BEGIN
      SELECT 'TRUNCATE TABLE ' || string_agg(format('%I.%I', schemaname, tablename), ', ')
        || ' CASCADE'
      INTO stmts
      FROM pg_tables
      WHERE (
          (schemaname = 'public'
                AND tablename NOT LIKE '__drizzle%')
          OR schemaname = 'auth'
        );
      IF stmts IS NOT NULL THEN
        EXECUTE stmts;
      END IF;
    END $$;
  `);
}

/**
 * Truncate, then run `fn` inside a transaction that always rolls back.
 * Use for repo / applyPatch(tx) tests that never need committed rows.
 */
export async function withTestTx<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  await resetTestDb();
  let stored: { value: T } | undefined;
  try {
    await db.transaction(async (tx) => {
      stored = { value: await fn(tx) };
      tx.rollback();
    });
  } catch (error) {
    if (error instanceof TransactionRollbackError && stored !== undefined) {
      return stored.value;
    }
    if (error instanceof Error) throw error;
    throw new Error("withTestTx: thrown non-Error", { cause: error });
  }
  throw new Error("withTestTx: expected rollback");
}
