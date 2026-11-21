import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  acquirePool,
  createPool,
  endPool,
  POOL_END_TIMEOUT_SECONDS,
  withPool,
  type Pool,
} from "../client";

type PoolSlot = { __watchdogPool?: Pool };
const slot = globalThis as typeof globalThis & PoolSlot;

/**
 * The process-pool slot (`globalThis.__watchdogPool`) is what keeps `vite dev` / `tsx watch`
 * reloads from piling up pools (Postgres 53300). The slot is swapped for a private pool here
 * and restored after, so the shared test pool other files use is never ended.
 */
describe("process pool slot", () => {
  let saved: Pool | undefined;
  const extras: Pool[] = [];

  beforeEach(() => {
    saved = slot.__watchdogPool;
    slot.__watchdogPool = undefined;
  });

  afterEach(async () => {
    const current = slot.__watchdogPool;
    slot.__watchdogPool = saved;
    if (current !== undefined && current !== saved) await endPool(current);
    await Promise.all(extras.splice(0).map(async (pool) => endPool(pool)));
  });

  it("hands out one pool per process, however often it is acquired (the HMR guard)", () => {
    const first = acquirePool();
    expect(acquirePool()).toBe(first);
    expect(slot.__watchdogPool).toBe(first);
  });

  it("ends the pool and clears the slot, so the next acquire opens a fresh one", async () => {
    const first = acquirePool();
    await endPool();
    expect(slot.__watchdogPool).toBeUndefined();
    // The ended client refuses work; nothing hands it out again.
    await expect(first.client`select 1`).rejects.toMatchObject({
      code: "CONNECTION_ENDED",
    });
    const second = acquirePool();
    expect(second).not.toBe(first);
  });

  it("ends a pool twice without error", async () => {
    const pool = acquirePool();
    await endPool(pool);
    await expect(endPool(pool)).resolves.toBeUndefined();
  });

  it("leaves the process slot alone when it ends another pool", async () => {
    const owned = acquirePool();
    const other = createPool("postgres://x:y@127.0.0.1:1/z");
    extras.push(other);
    await endPool(other);
    expect(slot.__watchdogPool).toBe(owned);
  });

  it("withPool ends the pool after the work, also when the work throws", async () => {
    let seen: Pool | undefined;
    await expect(
      withPool(async (pool) => {
        seen = pool;
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");
    expect(seen).toBeDefined();
    expect(slot.__watchdogPool).toBeUndefined();
  });

  it("bounds the wait for in-flight queries with a named timeout", () => {
    expect(POOL_END_TIMEOUT_SECONDS).toBeGreaterThan(0);
    expect(POOL_END_TIMEOUT_SECONDS).toBeLessThanOrEqual(30);
  });
});
