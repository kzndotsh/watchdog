import { Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybookDef } from "@watchdog/caps";
import { recordingBlobStore } from "@watchdog/core/blob";
import { isDomainTag } from "@watchdog/core/errors";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  cancelPlaybookRunEffect,
  recordingJobQueue,
  retryJobEffect,
  runPlaybookEffect,
} from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { db, jobsRepo, playbookRunsRepo, type JobRow } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { settleJobEffect } from "../lifecycle/settle.ts";
import { advancePlaybookTailEffect } from "../lifecycle/tail.ts";

/** Step 1 is independent of step 0; step 2 reads step 0 (a bind from its Job). */
const CHAIN: PlaybookDef = {
  id: "retry-resume-chain",
  title: "Retry resume chain",
  description: "Step 1 is independent; step 2 depends on step 0.",
  seedKinds: ["host"],
  steps: [
    "network.dns.lookup",
    "network.whois.lookup",
    {
      capabilityId: "network.ct.lookup",
      bind: { host: { step: 0, bag: "host" } },
    },
  ],
};

vi.mock("@watchdog/caps", async (importOriginal) => {
  const original = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...original,
    requirePlaybook: (id: string) =>
      id === "retry-resume-chain" ? CHAIN : original.requirePlaybook(id),
  };
});

// Enqueues land in a recording queue instead of a real pg-boss.
const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(
    Layer.provideMerge(vaultLayer, Db.layer),
    queue.layer,
    recordingBlobStore().layer
  )
);

type Cased = Awaited<ReturnType<typeof seedCase>>;

async function startRun(cased: Cased) {
  const started = await runDomain(
    runPlaybookEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      playbookId: CHAIN.id,
      actorId: TEST_ACTOR_ID,
      actorLabel: TEST_ACTOR_ID,
      seed: { host: "mailhost.test" },
    })
  );
  return started.playbookRunId;
}

async function stepJobs(runId: string, step: number): Promise<JobRow[]> {
  const members = await jobsRepo.listForPlaybookRun(db, runId);
  return members.filter((job) => job.playbookStep === step);
}

async function onlyJob(runId: string, step: number): Promise<JobRow> {
  const found = await stepJobs(runId, step);
  const [job] = found;
  if (found.length !== 1 || job === undefined) {
    throw new TypeError(`expected one Job at step ${step}`);
  }
  return job;
}

/** Run a queued Job to a terminal status through the lifecycle and its tail, as the worker does. */
async function settle(cased: Cased, job: JobRow, result: "succeed" | "fail") {
  const target = { jobId: job.id, caseId: cased.id };
  await runDomain(settleJobEffect(target, { kind: "claim" }));
  await runDomain(
    settleJobEffect(
      target,
      result === "succeed"
        ? { kind: "succeed" }
        : { kind: "fail", cause: "cap_failed" },
      result === "fail" ? { error: "boom" } : {}
    )
  );
  await runDomain(
    advancePlaybookTailEffect({ ...target, playbookRunId: job.playbookRunId })
  );
}

function retry(cased: Cased, job: JobRow) {
  return runDomain(
    retryJobEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      jobId: job.id,
      actorId: TEST_ACTOR_ID,
    })
  );
}

describe("retry resumes a Playbook run (#354)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("runs the independent step past a failure, skips the dependent, then resumes it when step 0's retry succeeds", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);

    // Step 0 fails: the run goes on with the independent step 1.
    await settle(cased, await onlyJob(runId, 0), "fail");
    expect((await playbookRunsRepo.get(db, runId))?.status).toBe("running");
    const step1 = await onlyJob(runId, 1);
    expect(step1.capabilityId).toBe("network.whois.lookup");
    expect(step1.status).toBe("queued");

    // Step 1 succeeds: step 2 depends on the failed step 0, so it is skipped and the run ends partial.
    await settle(cased, step1, "succeed");
    expect(await stepJobs(runId, 2)).toHaveLength(0);
    const partial = await playbookRunsRepo.get(db, runId);
    expect(partial).toMatchObject({ status: "finished", outcome: "partial" });
    expect(partial?.finishedAt).not.toBeNull();

    // Retrying step 0 lands in the same run and step, and reopens the run.
    const failed0 = await onlyJob(runId, 0);
    const retried = await retry(cased, failed0);
    expect(retried).toMatchObject({
      playbookRunId: runId,
      playbookStep: 0,
      playbookFanIndex: 0,
      retryOfJobId: failed0.id,
      playbookId: CHAIN.id,
      playbookRunStatus: "running",
      playbookRunOutcome: null,
      status: "queued",
    });
    expect(await playbookRunsRepo.get(db, runId)).toMatchObject({
      status: "running",
      outcome: null,
      finishedAt: null,
    });

    // The retry succeeds: the skipped dependent runs, and its success makes the outcome succeeded.
    const retryRow = await jobsRepo.get(db, retried.id);
    if (retryRow === null) throw new TypeError("retry Job missing");
    await settle(cased, retryRow, "succeed");
    const step2 = await onlyJob(runId, 2);
    expect(step2.capabilityId).toBe("network.ct.lookup");
    expect(step2.status).toBe("queued");
    expect((await playbookRunsRepo.get(db, runId))?.status).toBe("running");

    await settle(cased, step2, "succeed");
    expect(await playbookRunsRepo.get(db, runId)).toMatchObject({
      status: "finished",
      outcome: "succeeded",
    });
  });

  it("finishes failed when every step fails, and a retry can lift it to partial", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);
    await settle(cased, await onlyJob(runId, 0), "fail");
    await settle(cased, await onlyJob(runId, 1), "fail");
    expect(await playbookRunsRepo.get(db, runId)).toMatchObject({
      status: "finished",
      outcome: "failed",
    });

    const retried = await retry(cased, await onlyJob(runId, 1));
    expect(retried.playbookStep).toBe(1);
    const row = await jobsRepo.get(db, retried.id);
    if (row === null) throw new TypeError("retry Job missing");
    await settle(cased, row, "succeed");
    expect(await playbookRunsRepo.get(db, runId)).toMatchObject({
      status: "finished",
      outcome: "partial",
    });
  });

  it("lets only one of two concurrent retries of the same step through", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);
    await settle(cased, await onlyJob(runId, 0), "fail");
    await settle(cased, await onlyJob(runId, 1), "succeed");
    const failed0 = await onlyJob(runId, 0);

    const results = await Promise.allSettled([
      retry(cased, failed0),
      retry(cased, failed0),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      rejected.every(
        (r) =>
          isDomainTag(r.reason) &&
          r.reason.code === "conflict" &&
          r.reason.message.includes("already being retried")
      )
    ).toBe(true);

    const atStep0 = await stepJobs(runId, 0);
    expect(atStep0).toHaveLength(2);
    expect(atStep0.filter((job) => job.status === "queued")).toHaveLength(1);
  });

  it("does not resume a run the user cancelled: the retry is a standalone Job", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);
    await settle(cased, await onlyJob(runId, 0), "fail");
    await runDomain(
      cancelPlaybookRunEffect(cased.id, TEST_ORGANIZATION_ID, runId)
    );

    const retried = await retry(cased, await onlyJob(runId, 0));
    expect(retried.playbookRunId).toBeNull();
    expect(retried.retryOfJobId).not.toBeNull();
    expect(await playbookRunsRepo.get(db, runId)).toMatchObject({
      status: "cancelled",
      outcome: null,
    });
  });

  it("still retries a standalone Job as a standalone Job", async () => {
    const cased = await seedCase(db);
    const failed = await seedJob(db, cased.id, { status: "failed" });
    const retried = await retry(cased, failed);
    expect(retried).toMatchObject({
      playbookRunId: null,
      playbookStep: null,
      playbookRunStatus: null,
      playbookRunOutcome: null,
      retryOfJobId: failed.id,
    });
  });
});
