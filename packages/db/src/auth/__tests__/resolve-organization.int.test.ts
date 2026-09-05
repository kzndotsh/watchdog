import { describe, expect, it } from "vitest";

import { withTestTx } from "@watchdog/test-kit/db";

import { member, organization, user } from "../../schema/auth";
import { resolveUserOrganizationId } from "../resolve-organization";

async function insertUser(
  tx: Parameters<typeof resolveUserOrganizationId>[0],
  id: string
) {
  await tx.insert(user).values({
    id,
    name: "Member",
    email: `${id}@example.test`,
    emailVerified: false,
  });
}

async function insertOrg(
  tx: Parameters<typeof resolveUserOrganizationId>[0],
  id: string,
  createdAt: Date
) {
  await tx.insert(organization).values({
    id,
    name: id,
    slug: id,
    createdAt,
  });
}

describe("resolveUserOrganizationId", () => {
  it("returns preferred membership and does not fall back when preferred is foreign", async () => {
    await withTestTx(async (tx) => {
      const userId = crypto.randomUUID();
      const firstOrg = crypto.randomUUID();
      const secondOrg = crypto.randomUUID();
      const t0 = new Date("2026-01-01T00:00:00.000Z");
      const t1 = new Date("2026-01-02T00:00:00.000Z");
      await insertUser(tx, userId);
      await insertOrg(tx, firstOrg, t0);
      await insertOrg(tx, secondOrg, t1);
      await tx.insert(member).values([
        {
          id: crypto.randomUUID(),
          userId,
          organizationId: firstOrg,
          role: "member",
          createdAt: t0,
        },
        {
          id: crypto.randomUUID(),
          userId,
          organizationId: secondOrg,
          role: "member",
          createdAt: t1,
        },
      ]);

      expect(await resolveUserOrganizationId(tx, userId, secondOrg)).toBe(
        secondOrg
      );
      expect(
        await resolveUserOrganizationId(tx, userId, crypto.randomUUID())
      ).toBeNull();
      expect(await resolveUserOrganizationId(tx, userId)).toBe(firstOrg);
    });
  });
});
