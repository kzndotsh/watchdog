import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { isDomainTag } from "@watchdog/core/errors";
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
import { db, jobsRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetTestDb,
  seedCase,
  seedEvidence,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { settleJobEffect } from "../lifecycle/settle.ts";
import { advancePlaybookRunEffect } from "../stages/chain.ts";

const queue = recordingJobQueue();
const runDomain = runDomainWith(
  Layer.mergeAll(
    Layer.provideMerge(vaultLayer, Db.layer),
    queue.layer,
    recordingBlobStore().layer
  )
);

async function jobEntries() {
  const rows = await listAllActivity();
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
      settleJobEffect({ jobId: job.id, caseId: cased.id }, { kind: "claim" })
    );
    await runDomain(
      settleJobEffect(
        { jobId: job.id, caseId: cased.id },
        { kind: "succeed" },
        { finishedAt: new Date() }
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
      settleJobEffect(
        { jobId: job.id, caseId: cased.id },
        { kind: "fail", cause: "cap_failed" },
        { error: "boom", finishedAt: new Date() }
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
      settleJobEffect({ jobId: job.id, caseId: cased.id }, { kind: "succeed" })
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
      settleJobEffect({ jobId: job.id, caseId: cased.id }, { kind: "claim" })
    );
    await runDomain(
      settleJobEffect(
        { jobId: job.id, caseId: cased.id },
        { kind: "succeed" },
        { finishedAt: new Date() }
      )
    );
    const before = await jobEntries();
    await expect(
      runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id))
    ).rejects.toSatisfy(
      (error: unknown) => isDomainTag(error) && error.code === "conflict"
    );
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
      settleJobEffect({ jobId: step0.id, caseId: cased.id }, { kind: "claim" })
    );
    await runDomain(
      settleJobEffect(
        { jobId: step0.id, caseId: cased.id },
        { kind: "succeed" },
        { finishedAt: new Date() }
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
      "running",
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
    expect(rows[3]?.subjectId).toBe(step1?.id);

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
