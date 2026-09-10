import { describe, it, expect } from "vitest";

import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import { seedCase, withTestTx } from "@watchdog/test-kit/db";

import { casesRepo } from "../cases.repo.ts";

describe("casesRepo", () => {
  it("returns the created case from getById and list", async () => {
    await withTestTx(async (tx) => {
      const created = await seedCase(tx, { slug: "alpha-case" });
      const byId = await casesRepo.getById(
        tx,
        created.id,
        created.organizationId
      );
      expect(byId?.id).toBe(created.id);
      expect(byId?.slug).toBe("alpha-case");

      const listed = await casesRepo.list(tx, created.organizationId);
      expect(listed.some((row) => row.id === created.id)).toBe(true);
    });
  });

  it("throws when creating a second case with a unique slug", async () => {
    await withTestTx(async (tx) => {
      await seedCase(tx, { slug: "taken-slug" });
      await expect(
        casesRepo.create(tx, {
          name: "Other Case",
          slug: "taken-slug",
          description: null,
          organizationId: TEST_ORGANIZATION_ID,
        })
      ).rejects.toThrow();
    });
  });

  it("trims padded case id on getById", async () => {
    await withTestTx(async (tx) => {
      const created = await seedCase(tx, { slug: "trimmed-get" });
      const row = await casesRepo.getById(
        tx,
        `  ${created.id}  `,
        created.organizationId
      );
      expect(row?.id).toBe(created.id);
    });
  });

  it("getBySlug slugifies display-style names", async () => {
    await withTestTx(async (tx) => {
      const created = await seedCase(tx, {
        name: "Alpha Investigation",
        slug: "alpha-investigation",
      });
      const row = await casesRepo.getBySlug(
        tx,
        "Alpha Investigation",
        created.organizationId
      );
      expect(row?.id).toBe(created.id);
    });
  });
});
