import { sql } from "drizzle-orm";

import type { DbExec } from "./exec";

/** Serialises vault master-key rotations ("WDVAULTK" as bytes) for the length of a transaction. */
const VAULT_REKEY_LOCK_KEY = 0x57_44_56_41_55_4c_54_4bn;

/** Take the rotation advisory lock until `exec`'s transaction ends. */
export async function lockVaultRekey(exec: DbExec): Promise<void> {
  await exec.execute(
    sql`select pg_advisory_xact_lock(${VAULT_REKEY_LOCK_KEY.toString()}::bigint)`
  );
}
