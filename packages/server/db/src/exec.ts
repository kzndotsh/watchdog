import type { db } from "./client";

/** Drizzle transaction handle — same shape as nested `db.transaction` callback arg. */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Pool client or in-flight transaction — repos take this as the first parameter. */
export type DbExec = typeof db | DbTx;
