import { Layer } from "effect";

import { Db } from "@watchdog/core/infra";
import type { DbExec } from "@watchdog/db";

import { testDb } from "../test-db.ts";

/**
 * Test Layer for core's `Db` service over the shared test connection. Pair it
 * with `runDomainWith(TestDbLayer)`. Service tests commit and truncate
 * (`resetTestDb`), so the pool is the usual client.
 */
export const TestDbLayer = Layer.succeed(Db, Db.of(testDb));

/** Provide any `DbExec` (e.g. the `tx` from `withTestTx`, or a spying wrapper). */
export function testDbLayerOf(exec: DbExec): Layer.Layer<Db> {
  return Layer.succeed(Db, Db.of(exec));
}
