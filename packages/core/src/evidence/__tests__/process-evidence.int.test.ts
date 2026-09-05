import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  confirmFileUploadEffect,
  enrichUrlEvidenceEffect,
  markEvidenceProcessedEffect,
  processEvidenceEffect,
  runDomain,
} from "@watchdog/core";
import { casesRepo, db, evidenceRepo } from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedEvidence } from "@watchdog/test-kit/db";

describe("processEvidence", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("starts harvest and returns the active job on a second call", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const first = await runDomain(
      processEvidenceEffect({
        caseId: cased.id,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(first.capabilityId).toBe("evidence.harvest");
    expect(first.input).toEqual({ evidenceId: evidence.id });
    expect(first.input).not.toHaveProperty("entityId");
    const second = await runDomain(
      processEvidenceEffect({
        caseId: cased.id,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(second.id).toBe(first.id);
  });

  it("starts extract.ai when ai is true", async () => {
    const cased = await seedCase(db);
    await casesRepo.update(db, cased.id, cased.organizationId, {
      allowThirdPartyEgress: true,
    });
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    await expect(
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          ai: true,
        })
      )
    ).rejects.toThrow(/credential/i);
  });

  it("rejects enrich on a non-http dump", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, {
      kind: "attestation",
      text: "not a url",
      sourceUrl: null,
    });
    await expect(
      runDomain(
        enrichUrlEvidenceEffect({
          caseId: cased.id,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("stamps processedAt", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id);
    await runDomain(
      markEvidenceProcessedEffect({
        caseId: cased.id,
        evidenceId: evidence.id,
      })
    );
    const row = await evidenceRepo.getActiveInCase(db, cased.id, evidence.id);
    expect(row?.processedAt).not.toBeNull();
  });

  it("rejects confirmFile when the uri is not in the case prefix", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            uri: "other-case/file.bin",
            sha256: "ab".repeat(32),
            mime: "application/octet-stream",
            byteLength: 4,
          },
          TEST_ACTOR_ID
        )
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });
});
