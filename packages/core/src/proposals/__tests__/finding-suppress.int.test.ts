import { beforeEach, describe, expect, it } from "vitest";

import {
  createClaimEffect,
  createEventEffect,
  suppressKnownFindings,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { fingerprintPatchOp } from "@watchdog/schemas";
import {
  buildClaimCreateOp,
  buildEventCreateOp,
  TEST_ORGANIZATION_ID,
  testId,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedFindingSuppression,
  seedProposal,
} from "@watchdog/test-kit/db";

describe("suppressKnownFindings", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("drops ops that match a prior reject fingerprint", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(20) });
    const op = buildClaimCreateOp(entity.id, "Already rejected", {
      id: testId(30),
    });
    const fp = fingerprintPatchOp(op);
    if (fp === null) throw new Error("fp");
    const { id: proposalId } = await seedProposal(db, cased.id, [op]);
    await seedFindingSuppression(db, {
      caseId: cased.id,
      fingerprint: fp,
      reason: "rejected",
      proposalId,
    });

    const result = await suppressKnownFindings(cased.id, [
      op,
      buildClaimCreateOp(entity.id, "Fresh", { id: testId(31) }),
    ]);
    expect(result.suppressed).toBe(1);
    expect(result.kept).toHaveLength(1);
    expect(result.kept[0]?.data.text).toBe("Fresh");
  });

  it("drops a claim that already exists on the Graph", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    await runDomain(
      createClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Ada observed a host",
        confidence: "unverified",
        class: "observation",
      })
    );
    const result = await suppressKnownFindings(cased.id, [
      buildClaimCreateOp(entity.id, "Ada observed a host", { id: testId(32) }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.suppressed).toBe(1);
  });

  it("keeps event ops even when the Graph already has that event", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    await runDomain(
      createEventEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        when: "1815-12-10",
        what: "Born",
      })
    );
    const op = buildEventCreateOp(entity.id, "1815-12-10", "Born", {
      id: testId(33),
    });
    const result = await suppressKnownFindings(cased.id, [op]);
    expect(result.kept).toHaveLength(1);
  });
});
