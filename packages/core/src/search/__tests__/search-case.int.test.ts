import { beforeEach, describe, expect, it } from "vitest";

import { searchCaseEffect, runDomain } from "@watchdog/core";
import { db } from "@watchdog/db";
import { testId } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedIdentifier,
} from "@watchdog/test-kit/db";

describe("searchCase", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("hits an entity by name", async () => {
    const cased = await seedCase(db, {
      name: "Search Case",
      slug: "search-case",
    });
    await seedEntity(db, cased.id, {
      id: testId(20),
      name: "Ada Lovelace",
      slug: "ada-lovelace",
    });
    const result = await runDomain(
      searchCaseEffect({ caseId: cased.id, q: "Ada" })
    );
    expect(result.entities.some((hit) => hit.name === "Ada Lovelace")).toBe(
      true
    );
  });

  it("hits an identifier by value", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    await seedIdentifier(db, entity.id, {
      type: "email",
      value: "ada@mailhost.test",
    });
    const result = await runDomain(
      searchCaseEffect({ caseId: cased.id, q: "ada@mailhost" })
    );
    expect(
      result.identifiers.some((hit) => hit.value === "ada@mailhost.test")
    ).toBe(true);
  });
});
