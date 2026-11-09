import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-db";

import { user } from "../../schema/auth";
import { promoteFirstUserToInstanceAdmin } from "../instance-bootstrap";

async function insertAuthUser(
  tx: Parameters<typeof promoteFirstUserToInstanceAdmin>[0],
  id: string,
  email: string,
  createdAt = new Date()
) {
  await tx.insert(user).values({
    id,
    name: "Bootstrap",
    email,
    emailVerified: false,
    createdAt,
  });
}

/** The shared test DB may hold accounts from other suites; the tx rolls this back. */
async function emptyUsers(tx: Parameters<typeof insertAuthUser>[0]) {
  await tx.delete(user);
}

describe("promoteFirstUserToInstanceAdmin", () => {
  it("makes the first account the instance admin", async () => {
    await withTestTx(async (tx) => {
      await emptyUsers(tx);
      const userId = crypto.randomUUID();
      await insertAuthUser(tx, userId, `${userId}@example.test`);

      expect(await promoteFirstUserToInstanceAdmin(tx, userId)).toBe(true);

      const [row] = await tx
        .select({ role: user.role, banned: user.banned })
        .from(user)
        .where(eq(user.id, userId));
      expect(row?.role).toBe("admin");
      expect(row?.banned).toBe(false);
    });
  });

  it("leaves later accounts as ordinary users", async () => {
    await withTestTx(async (tx) => {
      await emptyUsers(tx);
      const firstId = crypto.randomUUID();
      const secondId = crypto.randomUUID();
      await insertAuthUser(
        tx,
        firstId,
        `${firstId}@example.test`,
        new Date("2026-01-01T00:00:00Z")
      );
      await insertAuthUser(
        tx,
        secondId,
        `${secondId}@example.test`,
        new Date("2026-01-01T00:00:01Z")
      );

      expect(await promoteFirstUserToInstanceAdmin(tx, secondId)).toBe(false);

      const [row] = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, secondId));
      expect(row?.role).not.toBe("admin");
    });
  });

  it("promotes no one once an instance admin exists, even the oldest account", async () => {
    await withTestTx(async (tx) => {
      await emptyUsers(tx);
      const oldestId = crypto.randomUUID();
      const adminId = crypto.randomUUID();
      await insertAuthUser(
        tx,
        oldestId,
        `${oldestId}@example.test`,
        new Date("2026-01-01T00:00:00Z")
      );
      await insertAuthUser(tx, adminId, `${adminId}@example.test`);
      await tx.update(user).set({ role: "admin" }).where(eq(user.id, adminId));

      expect(await promoteFirstUserToInstanceAdmin(tx, oldestId)).toBe(false);
    });
  });
});
