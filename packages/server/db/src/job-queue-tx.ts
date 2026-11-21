import { sql } from "drizzle-orm";
import { fromDrizzle, type Db as BossDb } from "pg-boss";

import type { DbTx } from "./exec";

/**
 * A transaction as pg-boss runs SQL on it: `boss.send(name, data, { db: jobQueueTx(tx) })`
 * inserts the delivery in `tx`, so it commits with the Job row and a rollback drops both. The
 * application role may write `pgboss.job` (`applyAppRoleGrants` grants it data privileges on
 * the `pgboss` schema), so the insert needs nothing the transaction does not already have.
 */
export function jobQueueTx(tx: DbTx): BossDb {
  return fromDrizzle(tx, sql);
}
