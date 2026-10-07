import { Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { processEvidenceEffect } from "@watchdog/core/evidence";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  cancelJobEffect,
  cancelPlaybookRunEffect,
  recordingJobQueue,
  runPlaybookEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { activityLogRepo, db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { setJobStatusEffect } from "../set-job-status.ts";
import { advancePlaybookRunEffect } from "../stages/chain.ts";

const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(
    Layer.provideMerge(vaultLayer, Db.layer),
    queue.layer,
    recordingBlobStore().layer
  )
);

const START = { xid: "0", id: 0 } as const;
const OTHER_ACTOR = "other-actor";

async function jobEntries() {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.kind === "job");
}

const APPEND_FAILURE = "append failed";

/** The next entry insert fails after the Job write ran: the whole transaction must roll back. */
function failNextAppend() {
  return vi
    .spyOn(activityLogRepo, "append")
    .mockRejectedValueOnce(new Error(APPEND_FAILURE));
}

/** The rejection must be the injected append failure, not any other error. */
async function expectAppendFailure(run: Promise<unknown>) {
  await expect(run).rejects.toThrow(APPEND_FAILURE);
}

function startDns(caseId: Parameters<typeof startJobEffect>[0]["caseId"]) {
  return runDomain(
    startJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      capabilityId: "network.dns.lookup",
      actorId: TEST_ACTOR_ID,
      input: { host: "mailhost.test" },
    })
  );
}

describe("a Job write and its activity entry share one transaction", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("setJobStatus: a failed append rolls the status write back", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    const before = await jobEntries();
    const append = failNextAppend();
    await expectAppendFailure(
      runDomain(
        setJobStatusEffect(job.id, { status: "running" }, { caseId: cased.id })
      )
    );
    expect(append).toHaveBeenCalledTimes(1);
    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
    expect(await jobEntries()).toHaveLength(before.length);
  });

  it("start: a failed append leaves no Job row", async () => {
    const cased = await seedCase(db);
    const append = failNextAppend();
    await expectAppendFailure(startDns(cased.id));
    expect(append).toHaveBeenCalled();
    expect(await jobsRepo.listForCase(db, cased.id)).toEqual([]);
    expect(await jobEntries()).toEqual([]);
  });

  it("cancel: a failed append leaves the Job cancellable and queued", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    const append = failNextAppend();
    await expectAppendFailure(
      runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id))
    );
    expect(append).toHaveBeenCalled();
    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
    expect((await jobEntries()).map((row) => row.action)).toEqual(["queued"]);
  });

  it("playbook start: a failed append leaves no run and no Job", async () => {
    const cased = await seedCase(db);
    const append = failNextAppend();
    await expectAppendFailure(
      runDomain(
        runPlaybookEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          playbookId: "host-footprint",
          actorId: TEST_ACTOR_ID,
          seed: { host: "mailhost.test" },
        })
      )
    );
    expect(append).toHaveBeenCalled();
    expect(await jobsRepo.listForCase(db, cased.id)).toEqual([]);
    expect(await jobEntries()).toEqual([]);
  });

  it("playbook cancel: a failed append leaves the run and its Jobs untouched", async () => {
    const cased = await seedCase(db);
    const started = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    const append = failNextAppend();
    await expectAppendFailure(
      runDomain(
        cancelPlaybookRunEffect(
          cased.id,
          TEST_ORGANIZATION_ID,
          started.playbookRunId
        )
      )
    );
    expect(append).toHaveBeenCalled();
    const members = await jobsRepo.listForPlaybookRun(
      db,
      started.playbookRunId
    );
    expect(members.map((job) => job.status)).toEqual(["queued"]);
    expect((await jobEntries()).map((row) => row.action)).toEqual(["queued"]);
    // the run row rolled back with the Jobs
    expect(
      (await playbookRunsRepo.get(db, started.playbookRunId))?.status
    ).toBe("running");
  });

  it("chain advance: a failed append creates no next step", async () => {
    const cased = await seedCase(db);
    const started = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    const step0 = started.jobs[0];
    if (step0 === undefined) throw new TypeError("expected step 0 job");
    await runDomain(
      setJobStatusEffect(
        step0.id,
        { status: "succeeded", finishedAt: new Date() },
        { caseId: cased.id }
      )
    );
    const append = failNextAppend();
    await expectAppendFailure(
      runDomain(
        advancePlaybookRunEffect({
          playbookRunId: started.playbookRunId,
        })
      )
    );
    expect(append).toHaveBeenCalled();
    const members = await jobsRepo.listForPlaybookRun(
      db,
      started.playbookRunId
    );
    expect(members).toHaveLength(1);
  });

  it("process Evidence: a failed append leaves no Job", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const append = failNextAppend();
    await expectAppendFailure(
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
        })
      )
    );
    expect(append).toHaveBeenCalled();
    expect(await jobsRepo.listForCase(db, cased.id)).toEqual([]);
  });

  it("two concurrent writers of the same status append one entry", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    // Widen the window between the status check and the update: without a row
    // lock every writer reads `queued` before any of them writes.
    const updateInCase = jobsRepo.updateInCase.bind(jobsRepo);
    vi.spyOn(jobsRepo, "updateInCase").mockImplementation(async (...args) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
      return updateInCase(...args);
    });
    const writers = Array.from({ length: 4 }, () =>
      runDomain(
        setJobStatusEffect(
          job.id,
          { status: "running", startedAt: new Date() },
          { caseId: cased.id }
        )
      )
    );
    await Promise.all(writers);
    expect((await jobEntries()).map((row) => row.action)).toEqual([
      "queued",
      "running",
    ]);
  });

  it("a write that keeps the status appends no second entry", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    for (let i = 0; i < 2; i += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- the second write must follow the first
      await runDomain(
        setJobStatusEffect(job.id, { status: "running" }, { caseId: cased.id })
      );
    }
    expect((await jobEntries()).map((row) => row.action)).toEqual([
      "queued",
      "running",
    ]);
  });
});

describe("cancel entries carry the Job's own actor", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("playbook cancel and chain abandon do not use the run's actor", async () => {
    const cased = await seedCase(db);
    const started = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    const other = await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "queued",
      actorId: OTHER_ACTOR,
      playbookRunId: started.playbookRunId,
      playbookStep: 1,
    });
    await runDomain(
      cancelPlaybookRunEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        started.playbookRunId
      )
    );
    const cancelled = (await jobEntries()).filter(
      (row) => row.action === "cancelled"
    );
    expect(cancelled.find((row) => row.subjectId === other.id)?.actorId).toBe(
      OTHER_ACTOR
    );
    expect(
      cancelled.find((row) => row.subjectId === started.jobs[0]?.id)?.actorId
    ).toBe(TEST_ACTOR_ID);
  });

  it("chain abandon records the blocked Job's actor", async () => {
    const cased = await seedCase(db);
    const started = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    const step0 = started.jobs[0];
    if (step0 === undefined) throw new TypeError("expected step 0 job");
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "blocked",
      actorId: OTHER_ACTOR,
      playbookRunId: started.playbookRunId,
      playbookStep: 1,
    });
    await runDomain(
      setJobStatusEffect(
        step0.id,
        { status: "failed", error: "x", finishedAt: new Date() },
        { caseId: cased.id }
      )
    );
    await runDomain(
      advancePlaybookRunEffect({ playbookRunId: started.playbookRunId })
    );
    const abandoned = (await jobEntries()).find(
      (row) => row.subjectId === blocked.id
    );
    expect(abandoned).toMatchObject({
      action: "cancelled",
      actorId: OTHER_ACTOR,
    });
  });
});
