import { describe, expect, it } from "vitest";

import { db, usersRepo } from "@watchdog/db";
import { seedAuthUser, withTestTx } from "@watchdog/test-kit/db";

describe("usersRepo.getByIds", () => {
  it("loads display rows by primary key", async () => {
    await withTestTx(async (tx) => {
      const id = crypto.randomUUID();
      await seedAuthUser(tx, {
        id,
        name: "Ada",
        email: `ada-${id}@mailhost.test`,
      });

      const rows = await usersRepo.getByIds(tx, [id, id, "missing"]);
      expect(rows).toEqual([
        { id, name: "Ada", email: `ada-${id}@mailhost.test` },
      ]);
    });
  });

  it("returns an empty list when no ids are given", async () => {
    const rows = await usersRepo.getByIds(db, []);
    expect(rows).toEqual([]);
  });
});
