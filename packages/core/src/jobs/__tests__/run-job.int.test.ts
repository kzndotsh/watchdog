import { Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import {
  capCacheRepo,
  db,
  jobsRepo,
  playbookRunsRepo,
  type JobArtifact,
} from "@watchdog/db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";
import {
  backdateJob,
  forceJobStatus,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
  seedPlaybookRun,
} from "@watchdog/test-db";

import { Db } from "../../infra/db-service.ts";
import { runDomainWith } from "../../infra/run-domain.ts";
import { createJobLog } from "../job-log.ts";
import { recordingJobQueue } from "../job-queue.ts";
import { settleJobEffect } from "../lifecycle/settle.ts";
import {
  advancePlaybookTailEffect,
  cacheSuccessTailEffect,
} from "../lifecycle/tail.ts";
import { advancePlaybookRunEffect } from "../stages/chain.ts";
import type { PreflightState } from "../stages/preflight.ts";

// Enqueues land in a recording queue instead of a real pg-boss.
const queue = recordingJobQueue();
const runDomain = runDomainWith(Layer.mergeAll(Db.layer, queue.layer));

function sha(): string {
  return "ab".repeat(32);
}

const REPORT_ARTIFACTS: JobArtifact[] = [
  {
    name: "dns-example.com.json",
    mime: "application/json",
    uri: "case/art.json",
    sha256: sha(),
  },
  {
    name: REPORT_JSON_ARTIFACT,
    mime: "application/json",
    uri: "case/report.json",
    sha256: sha(),
  },
];

const CACHE_KEY = { ttlMs: 600_000, inputHash: "input-hash-1" };

async function dnsState(jobId: string): Promise<PreflightState> {
  const job = await jobsRepo.get(db, jobId);
  if (!job) throw new Error("job missing");
  const cap = requireCapability("network.dns.lookup");
  return {
    jobId,
    job,
    capVersion: "test-version",
    cap,
    policy: cap.jobPolicy ?? {},
    input: { host: "example.com" },
    allowThirdPartyEgress: false,
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

describe("reconcileOrphanedQueuedJobs", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("listQueuedStale returns only queued jobs past the grace window", async () => {
    const cased = await seedCase(db);
    const stale = await seedJob(db, cased.id, { status: "queued" });
    await backdateJob(db, stale.id, {
      updatedAt: new Date(Date.now() - 3 * 60 * 1000),
    });
    const fresh = await seedJob(db, cased.id, { status: "queued" });
    await backdateJob(db, fresh.id, { updatedAt: new Date() });

    const rows = await jobsRepo.listQueuedStale(
      db,
      new Date(Date.now() - 120_000)
    );
    expect(rows.map((row) => row.id).sort()).toEqual([stale.id]);
  });

  it("listQueuedStale skips queued jobs on finished playbook runs", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "example.com" },
      status: "cancelled",
    });
    const orphan = await seedJob(db, cased.id, {
      status: "queued",
      playbookRunId: run.id,
    });
    await backdateJob(db, orphan.id, {
      updatedAt: new Date(Date.now() - 3 * 60 * 1000),
    });
    const standalone = await seedJob(db, cased.id, { status: "queued" });
    await backdateJob(db, standalone.id, {
      updatedAt: new Date(Date.now() - 3 * 60 * 1000),
    });

    const rows = await jobsRepo.listQueuedStale(
      db,
      new Date(Date.now() - 120_000)
    );
    expect(rows.map((row) => row.id)).toEqual([standalone.id]);
  });
});

describe("advancePlaybookTail", () => {
  beforeEach(async () => {
    await resetTestDb();
    queue.sends.length = 0;
  });

  it("finishes the playbook run when a step has failed", async () => {
    const cased = await seedCase(db);
    // host-contacts: the harvest step reads the WHOIS step, so a failed WHOIS ends the run.
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-contacts",
      seed: { host: "mailhost.test" },
    });
    const failed = await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      input: { host: "mailhost.test" },
      status: "running",
      playbookRunId: run.id,
      playbookStep: 0,
    });

    await runDomain(
      settleJobEffect(
        { jobId: failed.id, caseId: cased.id },
        { kind: "fail", cause: "cap_failed" },
        { error: "enrich failed" }
      )
    );
    await runDomain(
      advancePlaybookTailEffect({
        jobId: failed.id,
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const playbook = await playbookRunsRepo.get(db, run.id);
    expect(playbook).toMatchObject({ status: "finished", outcome: "failed" });
  });

  it("creates the next linear step after a success", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    const first = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      input: { host: "example.com" },
    });

    await runDomain(
      advancePlaybookTailEffect({
        jobId: first.id,
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    const next = members.filter((j) => j.playbookStep === 1);
    expect(next).toHaveLength(1);
    expect(next[0]?.capabilityId).toBe("network.whois.lookup");
    expect(next[0]?.status).toBe("queued");
  });

  it("does nothing for a Job outside a playbook run", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "failed" });
    await runDomain(
      advancePlaybookTailEffect({
        jobId: job.id,
        caseId: cased.id,
        playbookRunId: null,
      })
    );
    expect(queue.sends).toHaveLength(0);
  });
});

describe("cacheSuccessTail", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  async function cacheTail(
    jobId: string,
    overrides: Partial<Parameters<typeof cacheSuccessTailEffect>[0]> = {}
  ) {
    await runDomain(
      cacheSuccessTailEffect({
        state: await dnsState(jobId),
        jobLog: createJobLog(),
        key: CACHE_KEY,
        artifacts: REPORT_ARTIFACTS,
        resultSummary: "ok",
        fromCache: false,
        interpretError: null,
        ...overrides,
      })
    );
  }

  async function lookup(caseId: CaseId) {
    return capCacheRepo.lookupActive(
      db,
      caseId,
      "network.dns.lookup",
      "input-hash-1",
      "test-version",
      new Date()
    );
  }

  it("stores cap_cache when TTL and hash are set", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    await cacheTail(job.id);
    expect((await lookup(cased.id))?.jobId).toBe(job.id);
  });

  it("skips cache when interpret cap artifacts lack report.json", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    await cacheTail(job.id, { artifacts: REPORT_ARTIFACTS.slice(0, 1) });
    expect(await lookup(cased.id)).toBeNull();
  });

  it("skips cache when interpretError is set", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    await cacheTail(job.id, { interpretError: "bad report" });
    expect(await lookup(cased.id)).toBeNull();
  });

  it("skips cache on a cache-hit collect", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    await cacheTail(job.id, { fromCache: true });
    expect(await lookup(cased.id)).toBeNull();
  });

  it("skips cache when the Cap has no cache key", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    await cacheTail(job.id, { key: null });
    expect(await lookup(cased.id)).toBeNull();
  });
});

describe("advancePlaybookRunEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates the next linear step", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      input: { host: "example.com" },
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    const next = members.filter((j) => j.playbookStep === 1);
    expect(next).toHaveLength(1);
    expect(next[0]?.capabilityId).toBe("network.whois.lookup");
    expect(next[0]?.status).toBe("queued");
  });

  it("does not duplicate jobs when advance is called twice", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      input: { host: "example.com" },
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );
    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    expect(members.filter((j) => j.playbookStep === 1)).toHaveLength(1);
  });

  it("finishes the run failed when the step a later step reads failed", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-contacts",
      seed: { host: "example.com" },
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "failed",
      playbookRunId: run.id,
      playbookStep: 0,
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const finishedRun = await playbookRunsRepo.get(db, run.id);
    expect(finishedRun).toMatchObject({
      status: "finished",
      outcome: "failed",
    });
    expect(await jobsRepo.listForPlaybookRun(db, run.id)).toHaveLength(1);
  });

  it("goes on to the next independent step after a failure", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "failed",
      playbookRunId: run.id,
      playbookStep: 0,
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    expect((await playbookRunsRepo.get(db, run.id))?.status).toBe("running");
    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    const next = members.filter((j) => j.playbookStep === 1);
    expect(next).toHaveLength(1);
    expect(next[0]?.capabilityId).toBe("network.whois.lookup");
    expect(next[0]?.status).toBe("queued");
  });

  it("binds host-contacts harvest evidenceId from WHOIS Job evidenceIds", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-contacts",
    });
    const whoisEvidenceId = (await seedEvidence(db, cased.id)).id;
    await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      evidenceIds: [whoisEvidenceId],
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const harvest = (await jobsRepo.listForPlaybookRun(db, run.id)).find(
      (j) => j.playbookStep === 1
    );
    expect(harvest?.status).toBe("queued");
    expect(harvest?.input).toMatchObject({ evidenceId: whoisEvidenceId });
  });

  it("binds evidence-file hashlookup hash from file.analyze handoff", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "evidence-file",
    });
    const hash = "ab".repeat(32);
    await seedJob(db, cased.id, {
      capabilityId: "evidence.file.analyze",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      handoff: { hash: [hash] },
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const lookup = (await jobsRepo.listForPlaybookRun(db, run.id)).find(
      (j) => j.playbookStep === 1
    );
    expect(lookup?.status).toBe("queued");
    expect(lookup?.input).toMatchObject({ hash });
  });

  it("fans out host-enumerate DNS jobs and does not finish on first sibling success", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-enumerate",
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.ct.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      handoff: {
        host: ["a.example.com", "b.example.com", "c.example.com"],
      },
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    let members = await jobsRepo.listForPlaybookRun(db, run.id);
    const dns = members.filter((j) => j.capabilityId === "network.dns.lookup");
    expect(dns).toHaveLength(3);
    expect(dns.map((j) => j.playbookFanIndex).sort((a, b) => a - b)).toEqual([
      0, 1, 2,
    ]);

    const firstDns = dns[0];
    expect(firstDns).toBeDefined();
    if (firstDns === undefined) throw new TypeError("expected DNS job");
    await forceJobStatus(db, firstDns.id, "succeeded");
    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );
    const afterFirst = await playbookRunsRepo.get(db, run.id);
    expect(afterFirst?.status).toBe("running");
    members = await jobsRepo.listForPlaybookRun(db, run.id);
    expect(members.filter((j) => j.status === "queued")).toHaveLength(2);
  });

  it("caps host-enumerate fan-out at 25; empty CT names skip DNS and finish", async () => {
    const cased = await seedCase(db);
    const many = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-enumerate",
    });
    const hosts = Array.from({ length: 40 }, (_, i) => `h${i}.example.com`);
    await seedJob(db, cased.id, {
      capabilityId: "network.ct.lookup",
      status: "succeeded",
      playbookRunId: many.id,
      playbookStep: 0,
      handoff: { host: hosts },
    });
    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: many.id,
      })
    );
    const manyMembers = await jobsRepo.listForPlaybookRun(db, many.id);
    expect(
      manyMembers.filter((j) => j.capabilityId === "network.dns.lookup")
    ).toHaveLength(25);

    const emptyRun = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-enumerate",
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.ct.lookup",
      status: "succeeded",
      playbookRunId: emptyRun.id,
      playbookStep: 0,
      handoff: { host: [] },
    });
    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: emptyRun.id,
      })
    );
    const emptyMembers = await jobsRepo.listForPlaybookRun(db, emptyRun.id);
    const emptyFinished = await playbookRunsRepo.get(db, emptyRun.id);
    expect(
      emptyMembers.filter((j) => j.capabilityId === "network.dns.lookup")
    ).toHaveLength(0);
    expect(emptyFinished?.status).toBe("finished");
  });

  it("does not cancel sibling fan-out jobs when one fails", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-enumerate",
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.ct.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      handoff: { host: ["a.example.com", "b.example.com"] },
    });
    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );
    const afterFan = await jobsRepo.listForPlaybookRun(db, run.id);
    const dns = afterFan.filter((j) => j.capabilityId === "network.dns.lookup");
    expect(dns).toHaveLength(2);
    const failed = dns[0];
    const sibling = dns[1];
    expect(failed && sibling).toBeTruthy();
    if (failed === undefined || sibling === undefined) {
      throw new TypeError("expected two DNS jobs");
    }
    await forceJobStatus(db, failed.id, "failed");
    await runDomain(advancePlaybookRunEffect({ playbookRunId: run.id }));
    const siblingRow = await jobsRepo.get(db, sibling.id);
    expect(siblingRow?.status).toBe("queued");
  });
});
