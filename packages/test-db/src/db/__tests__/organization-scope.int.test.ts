import { beforeEach, describe, expect, it } from "vitest";

import { seedCase } from "../seed/case";
import { seedEntity } from "../seed/entity";
import { resetTestDb, withTestTx } from "../with-test-tx";

describe("withOrganizationScope", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  // Each scoped block opens a savepoint; two opened at once on one connection interleave and
  // abort the transaction, so a test that seeds with `Promise.all` must still work.
  it("runs scoped seeds started together on one transaction", async () => {
    await withTestTx(async (tx) => {
      const { id: caseId } = await seedCase(tx);
      const created = await Promise.all(
        ["Acme", "Borealis", "Cyprus", "Delta", "Echo", "Foxtrot"].map(
          async (name, n) =>
            seedEntity(tx, caseId, {
              id: `00000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`,
              name,
            })
        )
      );
      expect(created.map((row) => row.name)).toEqual([
        "Acme",
        "Borealis",
        "Cyprus",
        "Delta",
        "Echo",
        "Foxtrot",
      ]);
    });
  });
});
