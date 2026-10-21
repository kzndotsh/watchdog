import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { client, createPool, endPool } from "@watchdog/db";
import { env } from "@watchdog/env/server";

import { Db } from "../db-service";

/** A private pool over the test database, so the shared test pool is never ended. */
function privatePool() {
  const pool = createPool(env.DATABASE_URL);
  return { db: pool.db, end: async (t: number) => endPool(pool, t), pool };
}

async function backendIsAlive(pid: number): Promise<boolean> {
  const rows = await client`select 1 from pg_stat_activity where pid = ${pid}`;
  return rows.length > 0;
}

describe("Db.ownedBy (the pool owner)", () => {
  it("keeps the pool open while the scope lives and ends every connection when it closes", async () => {
    const owned = privatePool();
    const layer = Db.ownedBy(() => owned);

    const pid = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* inScope() {
          const db = yield* Db;
          // Every consumer reads the owner's handle.
          expect(db).toBe(owned.db);
          const [row] = yield* Effect.promise(
            async () =>
              owned.pool.client<
                { pid: number }[]
              >`select pg_backend_pid() as pid`
          );
          const backend = row?.pid ?? 0;
          // Open inside the scope: a query through the owner's handle is served.
          expect(
            yield* Effect.promise(async () => backendIsAlive(backend))
          ).toBe(true);
          return backend;
        })
      ).pipe(Effect.provide(layer))
    );

    // Scope closed: the owner ended the client, so its backend is gone ...
    await expect(backendIsAlive(pid)).resolves.toBe(false);
    // ... and the ended pool refuses further work instead of silently reconnecting.
    await expect(owned.pool.client`select 1`).rejects.toMatchObject({
      code: "CONNECTION_ENDED",
    });
  });

  it("ends the pool when the scope closes on a failure too", async () => {
    const owned = privatePool();

    await expect(
      Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* failing() {
            yield* Db;
            return yield* Effect.fail("boom" as const);
          })
        ).pipe(Effect.provide(Db.ownedBy(() => owned)))
      )
    ).rejects.toThrow("boom");

    await expect(owned.pool.client`select 1`).rejects.toMatchObject({
      code: "CONNECTION_ENDED",
    });
  });
});
