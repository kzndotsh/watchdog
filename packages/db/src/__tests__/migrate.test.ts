import { describe, expect, it } from "vitest";

import {
  MIGRATION_LOCK_KEY,
  migrationFailureMessage,
  withMigrationLock,
} from "../migrate";
import type { LockClient } from "../migrate";

/** A client that records each statement, with the lock key it was given. */
function recordingClient(log: string[], failUnlock = false): LockClient {
  return async (strings, ...params) => {
    const statement = strings.join("?").trim();
    log.push(`${statement} [${params.join(",")}]`);
    if (failUnlock && statement.includes("unlock")) {
      throw new Error("connection lost");
    }
  };
}

describe("withMigrationLock", () => {
  const key = MIGRATION_LOCK_KEY.toString();

  it("takes the lock before the work and releases it after", async () => {
    const log: string[] = [];
    const result = await withMigrationLock(recordingClient(log), async () => {
      log.push("work");
      return 42;
    });
    expect(result).toBe(42);
    expect(log).toEqual([
      `select pg_advisory_lock(?::bigint) [${key}]`,
      "work",
      `select pg_advisory_unlock(?::bigint) [${key}]`,
    ]);
  });

  it("releases the lock and rethrows when the work fails", async () => {
    const log: string[] = [];
    await expect(
      withMigrationLock(recordingClient(log), async () => {
        throw new Error("migration 0003 failed");
      })
    ).rejects.toThrow("migration 0003 failed");
    expect(log.at(-1)).toContain("pg_advisory_unlock");
  });

  it("keeps the work's outcome when the unlock itself fails", async () => {
    await expect(
      withMigrationLock(recordingClient([], true), async () => "applied")
    ).resolves.toBe("applied");
  });

  it("fits a signed 64-bit lock key", () => {
    expect(MIGRATION_LOCK_KEY).toBeLessThan(2n ** 63n);
  });
});

describe("migrationFailureMessage", () => {
  it("shows the database's own message instead of the statement drizzle wraps it in", () => {
    const database = new Error("Database invariants (#302): 3 stored rows");
    const wrapped = new Error("Failed query: the whole migration file", {
      cause: database,
    });
    expect(migrationFailureMessage(wrapped)).toBe(database.message);
  });

  it("keeps a plain error's message and stringifies a thrown non-error", () => {
    expect(migrationFailureMessage(new Error("connection refused"))).toBe(
      "connection refused"
    );
    expect(migrationFailureMessage("boom")).toBe("boom");
  });
});
