import { beforeEach, describe, expect, it } from "vitest";

import {
  createClaimEffect,
  retractClaimEffect,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { TEST_ACTOR_ID, TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-kit/db";

describe("createClaim", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates then retracts with retractedAt set", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const created = await runDomain(
      createClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Ada observed a host",
        confidence: "unverified",
        class: "observation",
      })
    );
    expect(created.retracted).toBe(false);

    const retracted = await runDomain(
      retractClaimEffect(
        {
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          claimId: created.id,
          kind: "retracted",
          reason: "not this",
        },
        TEST_ACTOR_ID
      )
    );
    expect(retracted.retracted).toBe(true);
    expect(retracted.retractedAt).toBeTruthy();
  });
});
