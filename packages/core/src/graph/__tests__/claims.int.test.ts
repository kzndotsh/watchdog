import { beforeEach, describe, expect, it } from "vitest";

import {
  createClaimEffect,
  DomainError,
  retractClaimEffect,
  runDomain,
  updateClaimEffect,
} from "@watchdog/core";
import { db, evidenceRepo } from "@watchdog/db";
import { TEST_ACTOR_ID, TEST_ORGANIZATION_ID, testId } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEntity, seedEvidence } from "@watchdog/test-kit/db";

describe("createClaim", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("trims padded entityId on create", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    const created = await runDomain(
      createClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: `  ${entity.id}  `,
        text: "Trimmed entity ref",
        confidence: "unverified",
        class: "observation",
      })
    );
    expect(created.entityId).toBe(entity.id);
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

  it("rejects blank actorId on retract", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(24) });
    const created = await runDomain(
      createClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Needs actor",
        confidence: "unverified",
        class: "observation",
      })
    );
    await expect(
      runDomain(
        retractClaimEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            claimId: created.id,
            kind: "retracted",
            reason: "no actor",
          },
          "   "
        )
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("rejects updates to retracted claims", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(21) });
    const created = await runDomain(
      createClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Will retract",
        confidence: "unverified",
        class: "observation",
      })
    );
    await runDomain(
      retractClaimEffect(
        {
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          claimId: created.id,
          kind: "retracted",
          reason: "superseded",
        },
        TEST_ACTOR_ID
      )
    );

    await expect(
      runDomain(
        updateClaimEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          claimId: created.id,
          text: "Should not apply",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
    );
  });

  it("rejects whitespace-only claim text", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(22) });
    await expect(
      runDomain(
        createClaimEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          entityId: entity.id,
          text: "   ",
          confidence: "unverified",
          class: "observation",
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("updates a claim that cites hidden evidence when evidenceIds are resent", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id, { id: testId(23) });
    const evidence = await seedEvidence(db, cased.id, { label: "Hidden cite" });
    const created = await runDomain(
      createClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        entityId: entity.id,
        text: "Cites evidence before hide",
        confidence: "unverified",
        class: "observation",
        evidenceIds: [evidence.id],
      })
    );
    await evidenceRepo.softDelete(db, cased.id, evidence.id);

    const updated = await runDomain(
      updateClaimEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        claimId: created.id,
        text: "Still cites hidden evidence",
        evidenceIds: [evidence.id],
      })
    );
    expect(updated.text).toBe("Still cites hidden evidence");
    expect(updated.evidenceIds).toEqual([evidence.id]);
  });
});
