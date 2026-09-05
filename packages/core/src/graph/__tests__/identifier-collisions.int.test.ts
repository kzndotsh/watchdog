import { beforeEach, describe, expect, it } from "vitest";

import {
  listProposalsForCaseEffect,
  runDomain
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { buildIdentifierCreateOp, testId, TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedIdentifier,
  seedProposal,
} from "@watchdog/test-kit/db";

describe("loadIdentifierCollisions", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("annotates a pending proposal when the value exists on another entity", async () => {
    const cased = await seedCase(db);
    const entityA = await seedEntity(db, cased.id, {
      id: testId(20),
      name: "Entity A",
      slug: "entity-a",
    });
    const entityB = await seedEntity(db, cased.id, {
      id: testId(21),
      name: "Entity B",
      slug: "entity-b",
    });
    await seedIdentifier(db, entityA.id, {
      type: "email",
      value: "ada@mailhost.test",
      platform: "",
    });
    await seedProposal(db, cased.id, [
      buildIdentifierCreateOp(entityB.id, "email", "ada@mailhost.test", {
        id: testId(30),
        data: { platform: "" },
      }),
    ]);

    const listed = await runDomain(listProposalsForCaseEffect(cased.id, TEST_ORGANIZATION_ID, { status: "pending" }));
    expect(listed[0]?.identifierCollisions?.length).toBeGreaterThan(0);
    expect(listed[0]?.identifierCollisions?.[0]?.entityName).toBe("Entity A");
  });
});
