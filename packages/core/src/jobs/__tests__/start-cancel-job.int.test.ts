import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { isDomainTag } from "@watchdog/core/errors";
import { dumpUrlEffect } from "@watchdog/core/evidence";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  recordingJobQueue,
  cancelJobEffect,
  getJobForCaseEffect,
  retryJobEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { db, evidenceRepo } from "@watchdog/db";
import { EGRESS_CLASSES } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  forceJobStatus,
  resetTestDb,
  seedAuthUser,
  seedCase,
  seedEvidence,
  seedJob,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

// Enqueues land in a recording queue instead of a real pg-boss.
const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(Layer.provideMerge(vaultLayer, Db.layer), queue.layer)
);

describe("startJob", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("inserts a queued dns lookup", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const other = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
  });

  it("accepts hidden evidence as enrich sourceEvidenceId", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
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
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
  });
});

describe("cancelJob", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("cancels a queued job and rejects a succeeded one", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const queued = await seedJob(db, cased.id, { status: "queued" });
    const cancelled = await runDomain(
      cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, queued.id)
    );
    expect(cancelled.status).toBe("cancelled");

    const done = await seedJob(db, cased.id, { status: "succeeded" });
    await expect(
      runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, done.id))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "conflict"
    );
  });
});

describe("retryJob", () => {
  beforeEach(async () => {
    await resetTestDb();
    queue.sends.length = 0;
  });

  const retry = (
    caseId: Parameters<typeof retryJobEffect>[0]["caseId"],
    jobId: string
  ) =>
    retryJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      jobId,
      actorId: TEST_ACTOR_ID,
      actorLabel: TEST_ACTOR_ID,
    });

  it.each(["failed", "cancelled", "succeeded"] as const)(
    "starts a linked new Job from a %s one and leaves the original unchanged",
    async (status) => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      const original = await seedJob(db, cased.id, {
        status,
        capabilityId: "network.dns.lookup",
        input: { host: "retry.test" },
      });
      const before = await runDomain(
        getJobForCaseEffect(cased.id, TEST_ORGANIZATION_ID, original.id)
      );

      const retried = await runDomain(retry(cased.id, original.id));

      expect(retried.id).not.toBe(original.id);
      expect(retried.status).toBe("queued");
      expect(retried.capabilityId).toBe("network.dns.lookup");
      expect(retried.input).toEqual({ host: "retry.test" });
      expect(retried.caseId).toBe(cased.id);
      expect(retried.retryOfJobId).toBe(original.id);
      expect(queue.sends.map((s) => s.payload.jobId)).toEqual([retried.id]);

      const after = await runDomain(
        getJobForCaseEffect(cased.id, TEST_ORGANIZATION_ID, original.id)
      );
      expect(after).toEqual(before);
      expect(after.retryOfJobId).toBeNull();
    }
  );

  it("links a retry of a retry to the Job it retried", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const first = await seedJob(db, cased.id, { status: "failed" });
    const second = await runDomain(retry(cased.id, first.id));
    await forceJobStatus(db, second.id, "failed");

    const third = await runDomain(retry(cased.id, second.id));

    expect(third.retryOfJobId).toBe(second.id);
  });

  it.each(["queued", "running"] as const)(
    "rejects a %s Job as a conflict and starts nothing",
    async (status) => {
      const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
      const open = await seedJob(db, cased.id, { status });

      await expect(runDomain(retry(cased.id, open.id))).rejects.toSatisfy(
        (error: unknown) => isDomainTag(error) && error.code === "conflict"
      );
      expect(queue.sends).toEqual([]);
    }
  );

  it("does not find a Job of another Case", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const other = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const foreign = await seedJob(db, other.id, { status: "failed" });

    await expect(runDomain(retry(cased.id, foreign.id))).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "not_found"
    );
    expect(queue.sends).toEqual([]);
  });

  it("applies the start checks again: a Cap input that is no longer valid is rejected", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const stale = await seedJob(db, cased.id, {
      status: "failed",
      capabilityId: "network.dns.lookup",
      input: {},
    });

    await expect(runDomain(retry(cased.id, stale.id))).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "invalid"
    );
    expect(queue.sends).toEqual([]);
  });
});
