import { beforeEach, describe, expect, it } from "vitest";

import { countIdentifiersByTypeEffect } from "@watchdog/core/graph";
import { runDomain } from "@watchdog/core/infra";
import { identifierListRepo } from "@watchdog/db";
import { identifierList } from "@watchdog/schemas/graph";
import { opsOf } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedIdentifier,
  testDb as db,
} from "@watchdog/test-db";
import { testId } from "@watchdog/test-kit";

describe("countIdentifiersByType", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function seedTwoEntities() {
    const cased = await seedCase(db);
    const acme = await seedEntity(db, cased.id, { id: testId(20) });
    const other = await seedEntity(db, cased.id, {
      id: testId(21),
      name: "Other",
      slug: "other",
    });
    await Promise.all(
      ["a.example", "b.example", "c.example"].map(async (value) =>
        seedIdentifier(db, acme.id, { type: "domain", value })
      )
    );
    await seedIdentifier(db, acme.id, {
      type: "email",
      value: "ops@a.example",
      status: "former",
    });
    await seedIdentifier(db, other.id, { type: "ip", value: "192.0.2.1" });
    const counts = (input: Record<string, unknown>) =>
      runDomain(
        countIdentifiersByTypeEffect(
          cased.id,
          TEST_ORGANIZATION_ID,
          identifierList.input.parse({ caseId: cased.id, ...input })
        )
      );
    return { cased, acme, counts };
  }

  it("counts one Entity's Identifiers per type, types with none left out", async () => {
    const { acme, counts } = await seedTwoEntities();

    expect(await counts({ entityId: acme.id })).toEqual({
      counts: [
        { type: "domain", count: 3 },
        { type: "email", count: 1 },
      ],
      isCapped: false,
    });
  });

  it("applies the list's filters and q", async () => {
    const { acme, counts } = await seedTwoEntities();

    expect(
      (await counts({ entityId: acme.id, status: ["former"] })).counts
    ).toEqual([{ type: "email", count: 1 }]);
    expect((await counts({ entityId: acme.id, q: "b.ex" })).counts).toEqual([
      { type: "domain", count: 1 },
    ]);
    expect((await counts({})).counts).toEqual([
      { type: "domain", count: 3 },
      { type: "email", count: 1 },
      { type: "ip", count: 1 },
    ]);
  });

  it("counts only the first cap + 1 matching rows", async () => {
    const { cased, acme } = await seedTwoEntities();

    const rows = await identifierListRepo.countsBy(
      db,
      { caseId: cased.id },
      opsOf(identifierList).queryOf({}, { entityId: acme.id }),
      "type",
      2
    );
    expect(rows.reduce((sum, row) => sum + row.count, 0)).toBe(3);
  });
});
