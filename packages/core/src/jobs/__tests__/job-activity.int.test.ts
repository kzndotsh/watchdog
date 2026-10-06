import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

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

async function jobEntries() {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.kind === "job");
}

function startDns(caseId: Parameters<typeof startJobEffect>[0]["caseId"]) {
  return runDomain(
    startJobEffect({
      caseId,
      organizationId: TEST_ORGANIZATION_ID,
      capabilityId: "network.dns.lookup",
      actorId: TEST_ACTOR_ID,
      actorLabel: TEST_ACTOR_ID,
      input: { host: "mailhost.test" },
    })
  );
}

describe("Job activity (ADR-0005 S2)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("start appends one queued entry for the Job", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    const rows = await jobEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      caseId: cased.id,
      kind: "job",
      action: "queued",
      subjectId: job.id,
      groupId: null,
      label: null,
      actorId: TEST_ACTOR_ID,
      toValue: "queued",
    });
  });

  it("queued, running and the terminal state each give one entry", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    await runDomain(
      setJobStatusEffect(job.id, { status: "running" }, { caseId: cased.id })
    );
    await runDomain(
      setJobStatusEffect(
        job.id,
        { status: "succeeded", finishedAt: new Date() },
        { caseId: cased.id, unlessCancelled: true }
      )
    );
    const rows = await jobEntries();
    expect(rows.map((row) => row.action)).toEqual([
      "queued",
      "running",
      "succeeded",
    ]);
    expect(new Set(rows.map((row) => row.subjectId))).toEqual(
      new Set([job.id])
    );
  });

  it("a failed Job gives a failed entry", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    await runDomain(
      setJobStatusEffect(
        job.id,
        { status: "failed", error: "boom", finishedAt: new Date() },
        { caseId: cased.id }
      )
    );
    expect((await jobEntries()).map((row) => row.action)).toEqual([
      "queued",
      "failed",
    ]);
  });

  it("an update that matches no row appends nothing", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    await runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id));
    const before = await jobEntries();
    const result = await runDomain(
      setJobStatusEffect(
        job.id,
        { status: "succeeded" },
        { caseId: cased.id, unlessCancelled: true }
      )
    );
    expect(result).toBeNull();
    expect(await jobEntries()).toHaveLength(before.length);
    expect((await jobsRepo.get(db, job.id))?.status).toBe("cancelled");
  });

  it("cancel appends one cancelled entry", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    await runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id));
    const rows = await jobEntries();
    expect(rows.map((row) => row.action)).toEqual(["queued", "cancelled"]);
    expect(rows[1]).toMatchObject({ subjectId: job.id, toValue: "cancelled" });
  });

  it("a rejected cancel (already terminal) appends nothing", async () => {
    const cased = await seedCase(db);
    const job = await startDns(cased.id);
    await runDomain(
      setJobStatusEffect(
        job.id,
        { status: "succeeded", finishedAt: new Date() },
        { caseId: cased.id }
      )
    );
    const before = await jobEntries();
    await expect(
      runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id))
    ).rejects.toBeDefined();
    expect(await jobEntries()).toHaveLength(before.length);
  });

  it("playbook start, chain advance and cancel group entries by run", async () => {
    const cased = await seedCase(db);
    const started = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    const step0 = started.jobs[0];
    if (step0 === undefined) throw new TypeError("expected step 0 job");
    let rows = await jobEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "queued",
      subjectId: step0.id,
      groupId: started.playbookRunId,
    });

    await runDomain(
      setJobStatusEffect(
        step0.id,
        { status: "succeeded", finishedAt: new Date() },
        { caseId: cased.id }
      )
    );
    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: started.playbookRunId,
      })
    );
    rows = await jobEntries();
    expect(rows.map((row) => row.action)).toEqual([
      "queued",
      "succeeded",
      "queued",
    ]);
    expect(new Set(rows.map((row) => row.groupId))).toEqual(
      new Set([started.playbookRunId])
    );
    const members = await jobsRepo.listForPlaybookRun(
      db,
      started.playbookRunId
    );
    const step1 = members.find((job) => job.playbookStep === 1);
    expect(rows[2]?.subjectId).toBe(step1?.id);

    const cancelled = await runDomain(
      cancelPlaybookRunEffect(
        cased.id,
        TEST_ORGANIZATION_ID,
        started.playbookRunId
      )
    );
    rows = await jobEntries();
    const cancelledRows = rows.filter((row) => row.action === "cancelled");
    expect(cancelledRows).not.toHaveLength(0);
    expect(new Set(cancelledRows.map((row) => row.subjectId))).toEqual(
      new Set(cancelled.cancelledJobIds)
    );
    expect(
      cancelledRows.every((row) => row.groupId === started.playbookRunId)
    ).toBe(true);
  });

  it("abandoning a blocked step appends a cancelled entry in the run group", async () => {
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
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: started.playbookRunId,
      })
    );
    const rows = await jobEntries();
    const abandoned = rows.find((row) => row.subjectId === blocked.id);
    expect(abandoned).toMatchObject({
      action: "cancelled",
      groupId: started.playbookRunId,
    });
  });

  it("processing Evidence appends a queued entry only for a new Job", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const input = {
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      evidenceId: evidence.id,
      actorId: TEST_ACTOR_ID,
      actorLabel: TEST_ACTOR_ID,
    };
    const first = await runDomain(processEvidenceEffect(input));
    await runDomain(processEvidenceEffect(input));
    const rows = await jobEntries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "queued", subjectId: first.id });
  });
});
