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
import { activityLogRepo, db, jobsRepo } from "@watchdog/db";
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

/** The next entry insert fails after the Job write ran: the whole transaction must roll back. */
function failNextAppend() {
  return vi
    .spyOn(activityLogRepo, "append")
    .mockRejectedValueOnce(new Error("append failed"));
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
    failNextAppend();
    await expect(
      runDomain(
        setJobStatusEffect(job.id, { status: "running" }, { caseId: cased.id })
      )
    ).rejects.toBeDefined();
    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
    expect(await jobEntries()).toHaveLength(before.length);
  });

  it("start: a failed append leaves no Job row", async () => {
    const cased = await seedCase(db);
    failNextAppend();
    await expect(startDns(cased.id)).rejects.toBeDefined();
    expect(await jobsRepo.listForCase(db, cased.id)).toEqual([]);
    expect(await jobEntries()).toEqual([]);
  });

  it("cancel: a failed append leaves the Job cancellable and queued", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    failNextAppend();
    await expect(
      runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id))
    ).rejects.toBeDefined();
    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
    expect((await jobEntries()).map((row) => row.action)).toEqual(["queued"]);
  });

  it("playbook start: a failed append leaves no run and no Job", async () => {
    const cased = await seedCase(db);
    failNextAppend();
    await expect(
      runDomain(
        runPlaybookEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          playbookId: "host-footprint",
          actorId: TEST_ACTOR_ID,
          seed: { host: "mailhost.test" },
        })
      )
    ).rejects.toBeDefined();
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
    failNextAppend();
    await expect(
      runDomain(
        cancelPlaybookRunEffect(
          cased.id,
          TEST_ORGANIZATION_ID,
          started.playbookRunId
        )
      )
    ).rejects.toBeDefined();
    const members = await jobsRepo.listForPlaybookRun(
      db,
      started.playbookRunId
    );
    expect(members.map((job) => job.status)).toEqual(["queued"]);
    expect((await jobEntries()).map((row) => row.action)).toEqual(["queued"]);
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
    failNextAppend();
    await expect(
      runDomain(
        advancePlaybookRunEffect({
          playbookRunId: started.playbookRunId,
        })
      )
    ).rejects.toBeDefined();
    const members = await jobsRepo.listForPlaybookRun(
      db,
      started.playbookRunId
    );
    expect(members).toHaveLength(1);
  });

  it("process Evidence: a failed append leaves no Job", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    failNextAppend();
    await expect(
      runDomain(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
        })
      )
    ).rejects.toBeDefined();
    expect(await jobsRepo.listForCase(db, cased.id)).toEqual([]);
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
