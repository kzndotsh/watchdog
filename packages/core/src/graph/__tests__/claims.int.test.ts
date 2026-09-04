import { beforeEach, describe, expect, it } from "vitest";

import { TEST_ACTOR_ID, testId } from "@watchdog/test-kit";
import {
  createClaimEffect,
  retractClaimEffect,
  runDomain
} from "@watchdog/core";
import { resetTestDb, seedCase, seedEntity } from "@watchdog/test-kit/db";
import { db } from "@watchdog/db";

describe("createClaim", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates then retracts with retractedAt set", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const created = await runDomain(createClaimEffect({
      caseId: cased.id,
      entityId: entity.id,
      text: "Ada observed a host",
      confidence: "unverified",
      class: "observation",
    }));
    expect(created.retracted).toBe(false);

    const retracted = await runDomain(retractClaimEffect(
      {
        caseId: cased.id,
        claimId: created.id,
        kind: "retracted",
        reason: "not this",
      },
      TEST_ACTOR_ID
    ));
    expect(retracted.retracted).toBe(true);
    expect(retracted.retractedAt).toBeTruthy();
  });
});
