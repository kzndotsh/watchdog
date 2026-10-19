import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-db";

import { user } from "../../schema/auth";
import { isUserBanned } from "../user-ban";

const NOW = new Date("2026-06-01T00:00:00.000Z");

async function insertUser(
  tx: Parameters<typeof isUserBanned>[0],
  ban: { banned?: boolean; banExpires?: Date }
): Promise<string> {
  const id = crypto.randomUUID();
  await tx.insert(user).values({
    id,
    name: "Member",
    email: `${id}@example.test`,
    emailVerified: false,
    ...ban,
  });
  return id;
}

describe("isUserBanned", () => {
  it("is false for a user who was never banned and for an unknown user", async () => {
    await withTestTx(async (tx) => {
      const id = await insertUser(tx, {});
      expect(await isUserBanned(tx, id, NOW)).toBe(false);
      expect(await isUserBanned(tx, crypto.randomUUID(), NOW)).toBe(false);
    });
  });

  it("is true for a ban with no expiry and for one that has not expired", async () => {
    await withTestTx(async (tx) => {
      const forever = await insertUser(tx, { banned: true });
      const later = await insertUser(tx, {
        banned: true,
        banExpires: new Date("2026-06-02T00:00:00.000Z"),
      });
      expect(await isUserBanned(tx, forever, NOW)).toBe(true);
      expect(await isUserBanned(tx, later, NOW)).toBe(true);
    });
  });

  it("is false once the ban has expired", async () => {
    await withTestTx(async (tx) => {
      const id = await insertUser(tx, {
        banned: true,
        banExpires: new Date("2026-05-31T00:00:00.000Z"),
      });
      expect(await isUserBanned(tx, id, NOW)).toBe(false);
    });
  });
});
