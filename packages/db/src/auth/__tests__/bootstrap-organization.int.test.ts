import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-kit/db";

import { member, organization, user } from "../../schema/auth";
import {
  bootstrapWatchdogOrganization,
  WATCHDOG_ORGANIZATION_SLUG,
} from "../bootstrap-organization";

async function insertAuthUser(
  tx: Parameters<typeof bootstrapWatchdogOrganization>[0],
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

describe("bootstrapWatchdogOrganization", () => {
  it("inserts the Watchdog org and owner member for the first user", async () => {
    await withTestTx(async (tx) => {
      const userId = crypto.randomUUID();
      await insertAuthUser(tx, userId, `${userId}@example.test`);

      const result = await bootstrapWatchdogOrganization(tx, userId);

      expect(result.created).toBe(true);
      expect(result.organizationId).toBeTruthy();

      const [org] = await tx
        .select()
        .from(organization)
        .where(eq(organization.id, result.organizationId ?? ""));
      expect(org?.slug).toBe(WATCHDOG_ORGANIZATION_SLUG);
      expect(org?.name).toBe("Watchdog");

      const [membership] = await tx
        .select()
        .from(member)
        .where(eq(member.userId, userId));
      expect(membership?.role).toBe("owner");
      expect(membership?.organizationId).toBe(result.organizationId);

      const [adminUser] = await tx
        .select({ role: user.role, banned: user.banned })
        .from(user)
        .where(eq(user.id, userId));
      expect(adminUser?.role).toBe("admin");
      expect(adminUser?.banned).toBe(false);
    });
  });

  it("does not create a second organization for a later user", async () => {
    await withTestTx(async (tx) => {
      const firstId = crypto.randomUUID();
      const secondId = crypto.randomUUID();
      await insertAuthUser(tx, firstId, `${firstId}@example.test`);
      await insertAuthUser(tx, secondId, `${secondId}@example.test`);

      await bootstrapWatchdogOrganization(tx, firstId);
      const second = await bootstrapWatchdogOrganization(tx, secondId);

      expect(second.created).toBe(false);
      expect(second.organizationId).toBeNull();

      const orgs = await tx.select({ id: organization.id }).from(organization);
      expect(orgs).toHaveLength(1);

      const secondMember = await tx
        .select()
        .from(member)
        .where(eq(member.userId, secondId));
      expect(secondMember).toHaveLength(0);
    });
  });
});
