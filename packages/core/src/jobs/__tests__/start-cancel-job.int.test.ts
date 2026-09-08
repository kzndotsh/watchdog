import { beforeEach, describe, expect, it } from "vitest";

import {
  DomainError,
  cancelJobEffect,
  dumpUrlEffect,
  getJobForCaseEffect,
  startJobEffect,
  runDomain,
} from "@watchdog/core";
import { db, evidenceRepo } from "@watchdog/db";
import { TEST_ACTOR_ID, TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedAuthUser,
  seedCase,
  seedEvidence,
  seedJob,
} from "@watchdog/test-kit/db";

describe("startJob", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("inserts a queued dns lookup", async () => {
    const cased = await seedCase(db);
    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        input: { host: "mailhost.test" },
      })
    );
    expect(job.status).toBe("queued");
    const reread = await runDomain(
      getJobForCaseEffect(cased.id, TEST_ORGANIZATION_ID, job.id)
    );
    expect(reread?.id).toBe(job.id);
    expect(reread?.status).toBe("queued");
    expect(reread?.input).toEqual({ host: "mailhost.test" });
    expect(reread?.actorLabel).toBe(TEST_ACTOR_ID);
  });

  it("resolves actorLabel from auth.user", async () => {
    const cased = await seedCase(db);
    const userId = crypto.randomUUID();
    await seedAuthUser(db, {
      id: userId,
      name: "Ada",
      email: `ada-${userId}@mailhost.test`,
    });
    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        actorId: userId,
        input: { host: "mailhost.test" },
      })
    );
    expect(job.actorLabel).toBe("ada");
  });

  it("rejects cap input referencing evidence outside the case", async () => {
    const cased = await seedCase(db);
    const other = await seedCase(db);
    const foreign = await seedEvidence(db, other.id);

    await expect(
      runDomain(
        startJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: "network.url.enrich",
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          input: {
            url: "https://mailhost.test/",
            sourceEvidenceId: foreign.id,
          },
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "invalid"
    );
  });

  it("accepts hidden evidence as enrich sourceEvidenceId", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        sourceUrl: "https://hidden-enrich.test/",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    await evidenceRepo.softDelete(db, cased.id, dumped.id);

    const job = await runDomain(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.url.enrich",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        input: {
          url: "https://hidden-enrich.test/",
          sourceEvidenceId: dumped.id,
        },
      })
    );

    expect(job.status).toBe("queued");
  });

  it("rejects hidden evidence for process caps", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    await evidenceRepo.softDelete(db, cased.id, evidence.id);

    await expect(
      runDomain(
        startJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          capabilityId: "evidence.file.analyze",
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          input: { evidenceId: evidence.id },
        })
      )
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "not_found"
    );
  });
});

describe("cancelJob", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("cancels a queued job and rejects a succeeded one", async () => {
    const cased = await seedCase(db);
    const queued = await seedJob(db, cased.id, { status: "queued" });
    const cancelled = await runDomain(
      cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, queued.id)
    );
    expect(cancelled.status).toBe("cancelled");

    const done = await seedJob(db, cased.id, { status: "succeeded" });
    await expect(
      runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, done.id))
    ).rejects.toSatisfy(
      (error: unknown) => DomainError.is(error) && error.code === "conflict"
    );
  });
});
