import { beforeEach, describe, expect, it } from "vitest";

import {
  createClaimEffect,
  createEventEffect,
  createIdentifierEffect,
  suppressKnownFindings,
  runDomain,
} from "@watchdog/core";
import { db } from "@watchdog/db";
import { fingerprintPatchOp } from "@watchdog/schemas";
import {
  buildClaimCreateOp,
  buildEntityCreateOp,
  buildEventCreateOp,
  buildIdentifierCreateOp,
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

  it("drops ops that match a pending proposal fingerprint", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(19) });
    const op = buildClaimCreateOp(entity.id, "Pending duplicate", {
      id: testId(29),
    });
    await seedProposal(db, cased.id, [op]);
    const result = await suppressKnownFindings(cased.id, [op]);
    expect(result.kept).toHaveLength(0);
    expect(result.suppressed).toBe(1);
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

  it("drops a claim whose text differs only by case from an existing Graph claim", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(26) });
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
      buildClaimCreateOp(entity.id, "Ada Observed A Host", { id: testId(37) }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.suppressed).toBe(1);
  });

  it("drops a claim with padded entityId that already exists on the Graph", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(23) });
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
      buildClaimCreateOp(`  ${entity.id}  `, "Ada observed a host", {
        id: testId(34),
      }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.suppressed).toBe(1);
  });

  it("drops an entity op when slug normalizes to an existing Graph slug", async () => {
    const cased = await seedCase(db);
    await seedEntity(db, cased.id, {
      id: testId(24),
      slug: "alpha-corp",
      name: "Alpha Corp",
    });
    const result = await suppressKnownFindings(cased.id, [
      buildEntityCreateOp("Alpha Corp", "  Alpha Corp  ", "org", {
        id: testId(35),
      }),
    ]);
    expect(result.kept).toHaveLength(0);
    expect(result.suppressed).toBe(1);
  });

  it("drops an identifier op with padded type that already exists on the Graph", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(25) });
    await runDomain(
      createIdentifierEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        type: "email",
        value: "ada@mailhost.test",
        confidence: "unverified",
        status: "unknown",
      })
    );
    const result = await suppressKnownFindings(cased.id, [
      buildIdentifierCreateOp(entity.id, "  email  ", "ada@mailhost.test", {
        id: testId(36),
        data: { platform: "" },
      }),
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
