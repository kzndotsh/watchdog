import { Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybookDef } from "@watchdog/caps";
import { recordingBlobStore } from "@watchdog/core/blob";
import { isDomainTag } from "@watchdog/core/errors";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  getPlaybookRunForCaseEffect,
  recordingJobQueue,
  retryJobEffect,
  runPlaybookEffect,
} from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { db, jobsRepo, type JobRow } from "@watchdog/db";
import { EGRESS_CLASSES } from "@watchdog/schemas/shared";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { settleJobEffect } from "../lifecycle/settle.ts";
import { advancePlaybookTailEffect } from "../lifecycle/tail.ts";

/** Step 1 is independent of step 0; step 2 reads step 0 (a bind from its Job). */
const CHAIN: PlaybookDef = {
  id: "run-view-chain",
  title: "Run view chain",
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
      id === "run-view-chain" ? CHAIN : original.requirePlaybook(id),
  };
});

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

async function onlyJob(runId: string, step: number): Promise<JobRow> {
  const found = (await jobsRepo.listForPlaybookRun(db, runId)).filter(
    (job) => job.playbookStep === step
  );
  const [job] = found;
  if (found.length !== 1 || job === undefined) {
    throw new TypeError(`expected one Job at step ${step}`);
  }
  return job;
}

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

function readRun(cased: Cased, runId: string) {
  return runDomain(
    getPlaybookRunForCaseEffect(cased.id, TEST_ORGANIZATION_ID, runId)
  );
}

describe("getPlaybookRunForCaseEffect (#354)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("lists the failed, succeeded and skipped steps of a partial run, the skipped one with its reason", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const runId = await startRun(cased);
    const step0 = await onlyJob(runId, 0);
    await settle(cased, step0, "fail");
    const step1 = await onlyJob(runId, 1);
    await settle(cased, step1, "succeed");

    const run = await readRun(cased, runId);
    expect(run).toMatchObject({
      id: runId,
      caseId: cased.id,
      playbookId: CHAIN.id,
      status: "finished",
      outcome: "partial",
    });
    expect(run.finishedAt).not.toBeNull();
    expect(run.steps).toEqual([
      {
        step: 0,
        capabilityId: "network.dns.lookup",
        state: "failed",
        jobIds: [step0.id],
      },
      {
        step: 1,
        capabilityId: "network.whois.lookup",
        state: "succeeded",
        jobIds: [step1.id],
      },
      {
        step: 2,
        capabilityId: "network.ct.lookup",
        state: "skipped",
        blockedBy: 0,
        jobIds: [],
      },
    ]);
  });

  it("shows a run in flight: the running step, the later steps pending, no outcome yet", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const runId = await startRun(cased);

    const run = await readRun(cased, runId);
    expect(run).toMatchObject({
      status: "running",
      outcome: null,
      finishedAt: null,
    });
    expect(run.steps.map((s) => s.state)).toEqual([
      "running",
      "pending",
      "pending",
    ]);
  });

  it("un-skips the dependent step when the failed step's retry is running, listing both attempts", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const runId = await startRun(cased);
    const failed0 = await onlyJob(runId, 0);
    await settle(cased, failed0, "fail");
    await settle(cased, await onlyJob(runId, 1), "succeed");

    const retried = await runDomain(
      retryJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        jobId: failed0.id,
        actorId: TEST_ACTOR_ID,
      })
    );

    const run = await readRun(cased, runId);
    expect(run).toMatchObject({ status: "running", outcome: null });
    expect(run.steps[0]).toMatchObject({
      state: "running",
      jobIds: [failed0.id, retried.id],
    });
    expect(run.steps[2]).toMatchObject({ state: "pending" });
    expect(run.steps[2]?.reason).toBeUndefined();
  });

  it("is NotFound for another organization, another Case and an unknown run", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const sibling = await seedCase(db, { slug: "sibling" });
    const runId = await startRun(cased);
    const failure = (
      organizationId: typeof TEST_ORGANIZATION_ID,
      caseId: Cased["id"],
      id: string
    ) =>
      runDomain(getPlaybookRunForCaseEffect(caseId, organizationId, id)).then(
        () => "read",
        (error: unknown) => (isDomainTag(error) ? error.code : "other")
      );

    expect(await failure(TEST_OTHER_ORGANIZATION_ID, cased.id, runId)).toBe(
      "not_found"
    );
    expect(await failure(TEST_ORGANIZATION_ID, sibling.id, runId)).toBe(
      "not_found"
    );
    expect(
      await failure(
        TEST_ORGANIZATION_ID,
        cased.id,
        "00000000-0000-4000-8000-000000000000"
      )
    ).toBe("not_found");
    expect(await failure(TEST_ORGANIZATION_ID, cased.id, runId)).toBe("read");
  });
});
