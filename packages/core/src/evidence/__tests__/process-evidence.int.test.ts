import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  confirmFileUploadEffect,
  enrichUrlEvidenceEffect,
  markEvidenceProcessedEffect,
  processEvidenceEffect,
  runDomain,
} from "@watchdog/core";
import { casesRepo, db, evidenceRepo, jobsRepo } from "@watchdog/db";
import {
  TEST_ACTOR_ID,
  TEST_ORGANIZATION_ID,
  testId,
} from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEntity,
  seedEvidence,
} from "@watchdog/test-kit/db";

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
        organizationId: TEST_ORGANIZATION_ID,
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
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(second.id).toBe(first.id);
  });

  it("rejects blank actorId before starting harvest", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    await expect(
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: "   ",
          actorLabel: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("dedupes concurrent harvest requests to one job", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const [first, second] = await Promise.all([
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
        })
      ),
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
        })
      ),
    ]);
    expect(first.id).toBe(second.id);
    const listed = await jobsRepo.listForCase(db, cased.id);
    const harvestJobs = listed.filter(
      (row) => row.job.capabilityId === "evidence.harvest"
    );
    expect(harvestJobs).toHaveLength(1);
  });

  it("rejects a foreign organization before returning a deduped job", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    await runDomain(
      processEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    await expect(
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: testId(91),
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
    );
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
          organizationId: TEST_ORGANIZATION_ID,
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
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("starts a separate enrich job per evidence row with the same URL", async () => {
    const cased = await seedCase(db);
    const url = "https://mailhost.test/shared-page";
    const firstEvidence = await seedEvidence(db, cased.id, {
      kind: "attestation",
      sourceUrl: url,
      text: null,
    });
    const secondEvidence = await seedEvidence(db, cased.id, {
      kind: "attestation",
      sourceUrl: url,
      text: null,
    });
    const first = await runDomain(
      enrichUrlEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: firstEvidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    const second = await runDomain(
      enrichUrlEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: secondEvidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(second.id).not.toBe(first.id);
    expect(second.input).toMatchObject({ sourceEvidenceId: secondEvidence.id });
  });

  it("returns the blocked enrich job on a second call", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, {
      kind: "attestation",
      sourceUrl: "https://mailhost.test/page",
      text: null,
    });
    const first = await runDomain(
      enrichUrlEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    await jobsRepo.update(db, first.id, {
      status: "blocked",
      error: "Missing credential",
    });
    const second = await runDomain(
      enrichUrlEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(second.id).toBe(first.id);
    expect(second.status).toBe("blocked");
  });

  it("includes entityId in harvest job input when evidence is entity-linked", async () => {
    const cased = await seedCase(db);
    const entity = await seedEntity(db, cased.id);
    const evidence = await seedEvidence(db, cased.id, {
      kind: "file",
      entityId: entity.id,
    });
    const job = await runDomain(
      processEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: evidence.id,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(job.input).toEqual({
      evidenceId: evidence.id,
      entityId: entity.id,
    });
  });

  it("trims padded evidenceId when starting process", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, {
      sourceUrl: "https://mailhost.test/page",
      text: "https://mailhost.test/page",
    });
    const job = await runDomain(
      processEvidenceEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        evidenceId: `  ${evidence.id}  `,
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    expect(job.status).toBe("queued");
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

  it("does not re-stamp processedAt when evidence is already processed", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id);
    const input = { caseId: cased.id, evidenceId: evidence.id };
    await runDomain(markEvidenceProcessedEffect(input));
    const first = await evidenceRepo.getActiveInCase(db, cased.id, evidence.id);
    await runDomain(markEvidenceProcessedEffect(input));
    const second = await evidenceRepo.getActiveInCase(
      db,
      cased.id,
      evidence.id
    );
    expect(second?.processedAt).toEqual(first?.processedAt);
  });

  it("does not stamp processedAt on hidden evidence", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id);
    await evidenceRepo.softDelete(db, cased.id, evidence.id);
    await runDomain(
      markEvidenceProcessedEffect({
        caseId: cased.id,
        evidenceId: evidence.id,
      })
    );
    const hidden = await evidenceRepo.listForCase(db, cased.id, {
      deletedOnly: true,
    });
    expect(
      hidden.find((row) => row.id === evidence.id)?.processedAt
    ).toBeNull();
  });

  it("rejects confirmFile when the uri is not in the case prefix", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
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

  it("rejects whitespace-only confirmFile uri", async () => {
    const cased = await seedCase(db);
    await expect(
      runDomain(
        confirmFileUploadEffect(
          {
            caseId: cased.id,
            organizationId: TEST_ORGANIZATION_ID,
            uri: "   ",
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
