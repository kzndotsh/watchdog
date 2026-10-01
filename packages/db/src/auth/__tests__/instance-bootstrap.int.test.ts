import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-kit/db";

import { user } from "../../schema/auth";
import { promoteFirstUserToInstanceAdmin } from "../instance-bootstrap";

async function insertAuthUser(
  tx: Parameters<typeof promoteFirstUserToInstanceAdmin>[0],
  id: string,
  email: string
) {
  await tx.insert(user).values({
    id,
    name: "Bootstrap",
    email,
    emailVerified: false,
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
      await insertAuthUser(tx, firstId, `${firstId}@example.test`);
      await insertAuthUser(tx, secondId, `${secondId}@example.test`);

      expect(await promoteFirstUserToInstanceAdmin(tx, secondId)).toBe(false);

      const [row] = await tx
        .select({ role: user.role })
        .from(user)
        .where(eq(user.id, secondId));
      expect(row?.role).not.toBe("admin");
    });
  });
});
