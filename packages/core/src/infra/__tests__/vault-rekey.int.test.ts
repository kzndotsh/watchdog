import { describe, expect, it } from "vitest";

import { credentials, credentialsRepo, db, type DbTx } from "@watchdog/db";
import { env } from "@watchdog/env/server";

import {
  openSecret,
  openSecretWithMaster,
  sealSecretWithMaster,
} from "../vault-crypto";
import { rekeyVault } from "../vault-rekey";

/** What an old install has: a placeholder key that the new secrets check would refuse. */
const OLD_KEY = "change-me-to-a-long-random-string-at-least-32";
const WRONG_KEY = "not-the-key-these-credentials-were-sealed-with";
const NEW_KEY = env.WD_MASTER_VAULT_KEY;
const ROLLBACK = new Error("rollback");

const SECRETS = [
  { userId: "rekey-user-a", name: "SHODAN_API_KEY", secret: "shodan-secret-1" },
  { userId: "rekey-user-a", name: "HIBP_API_KEY", secret: "hibp-secret-2" },
  { userId: "rekey-user-b", name: "SHODAN_API_KEY", secret: "shodan-secret-3" },
];

/**
 * Run `body` in a transaction that always rolls back, on an emptied vault: the shared test
 * database may hold other suites' credentials (sealed under the test key), and rotation
 * touches every row. The rotation itself runs as a nested transaction (a savepoint).
 */
async function withEmptyVault(
  body: (tx: DbTx) => Promise<void>
): Promise<void> {
  await db
    .transaction(async (tx) => {
      await tx.delete(credentials);
      await body(tx);
      throw ROLLBACK;
    })
    .catch((error: unknown) => {
      if (error !== ROLLBACK) throw error;
    });
}

async function seedUnderOldKey(tx: DbTx): Promise<void> {
  for (const row of SECRETS) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- three rows, in order
    await credentialsRepo.create(tx, {
      userId: row.userId,
      name: row.name,
      ciphertext: sealSecretWithMaster(OLD_KEY, row.userId, row.secret),
    });
  }
}

async function snapshot(tx: DbTx): Promise<string[]> {
  const rows = await credentialsRepo.listAllCiphertexts(tx);
  return rows
    .map((row) => `${row.id}:${row.ciphertext.toString("hex")}`)
    .sort();
}

describe("rekeyVault", () => {
  it("re-encrypts every credential: opens under the new key, not the old one", async () => {
    await withEmptyVault(async (tx) => {
      await seedUnderOldKey(tx);

      const result = await rekeyVault(tx, {
        oldKey: OLD_KEY,
        newKey: NEW_KEY,
      });

      expect(result).toEqual({ status: "rotated", rows: SECRETS.length });
      const rows = await credentialsRepo.listAllCiphertexts(tx);
      expect(rows).toHaveLength(SECRETS.length);
      for (const row of rows) {
        const expected = SECRETS.find(
          (candidate) =>
            candidate.userId === row.userId &&
            candidate.secret === openSecret(row.userId, row.ciphertext)
        );
        expect(expected).toBeDefined();
        expect(() =>
          openSecretWithMaster(OLD_KEY, row.userId, row.ciphertext)
        ).toThrow();
      }
    });
  });

  it("aborts with a count and writes nothing when the old key is wrong", async () => {
    await withEmptyVault(async (tx) => {
      await seedUnderOldKey(tx);
      const before = await snapshot(tx);

      const result = await rekeyVault(tx, {
        oldKey: WRONG_KEY,
        newKey: NEW_KEY,
      });

      expect(result).toEqual({
        status: "undecryptable",
        failed: SECRETS.length,
        total: SECRETS.length,
      });
      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it("aborts when a single row does not open, leaving the good rows untouched", async () => {
    await withEmptyVault(async (tx) => {
      await seedUnderOldKey(tx);
      await credentialsRepo.create(tx, {
        userId: "rekey-user-c",
        name: "BROKEN",
        ciphertext: Buffer.from("not a vault blob at all, too short"),
      });
      const before = await snapshot(tx);

      const result = await rekeyVault(tx, {
        oldKey: OLD_KEY,
        newKey: NEW_KEY,
      });

      expect(result).toEqual({
        status: "undecryptable",
        failed: 1,
        total: SECRETS.length + 1,
      });
      expect(await snapshot(tx)).toEqual(before);
    });
  });

  it("fails cleanly on a second run, changing nothing", async () => {
    await withEmptyVault(async (tx) => {
      await seedUnderOldKey(tx);
      await rekeyVault(tx, { oldKey: OLD_KEY, newKey: NEW_KEY });
      const afterFirst = await snapshot(tx);

      const again = await rekeyVault(tx, { oldKey: OLD_KEY, newKey: NEW_KEY });

      expect(again).toEqual({
        status: "already-rotated",
        rows: SECRETS.length,
      });
      expect(await snapshot(tx)).toEqual(afterFirst);
    });
  });

  it("does nothing for an empty vault or identical keys", async () => {
    await withEmptyVault(async (tx) => {
      expect(
        await rekeyVault(tx, { oldKey: OLD_KEY, newKey: NEW_KEY })
      ).toEqual({ status: "empty" });
      await seedUnderOldKey(tx);
      const before = await snapshot(tx);
      expect(
        await rekeyVault(tx, { oldKey: ` ${OLD_KEY} `, newKey: OLD_KEY })
      ).toEqual({ status: "same-key" });
      expect(await snapshot(tx)).toEqual(before);
    });
  });
});
