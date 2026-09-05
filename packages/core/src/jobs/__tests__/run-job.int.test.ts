import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { capCacheRepo, db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import {
  resetTestDb,
  seedCase,
  seedJob,
  seedPlaybookRun,
} from "@watchdog/test-kit/db";

import { runDomain } from "../../infra/run-domain.ts";
import {
  reconcileStaleJobsEffect,
  reconcileStuckPlaybookRunsEffect,
} from "../reconcile-stale-jobs.ts";
import { runFailedPathEffect, runSucceededPathEffect } from "../run-paths.ts";
import { advancePlaybookRunEffect } from "../stages/chain.ts";
import type { CollectResult } from "../stages/collect.ts";
import { createJobLog } from "../stages/helpers.ts";
import type { PreflightState } from "../stages/preflight.ts";

function sha(): string {
  return "ab".repeat(32);
}

function fakeCollected(
  jobLog: ReturnType<typeof createJobLog>,
  overrides: Partial<CollectResult> = {}
): CollectResult {
  return {
    artifacts: [
      {
        name: "dns-example.com.json",
        mime: "application/json",
        uri: "case/art.json",
        sha256: sha(),
      },
    ],
    evidenceIds: [],
    fromCache: false,
    reclaim: false,
    runtime: {
      scratchDir: "/tmp",
      signal: new AbortController().signal,
      jobLog,
      evidenceSnapshot: undefined,
      linkedSource: undefined,
      cacheTtlMs: 600_000,
      inputHash: "input-hash-1",
    },
    ...overrides,
  };
}

async function dnsState(jobId: string): Promise<PreflightState> {
  const job = await jobsRepo.get(db, jobId);
  if (!job) throw new Error("job missing");
  const cap = requireCapability("network.dns.lookup");
  return {
    jobId,
    job,
    cap,
    policy: cap.jobPolicy ?? {},
    input: { host: "example.com" },
    allowThirdPartyEgress: false,
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

describe("reconcileStaleJobs", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("fails a running network.dns.lookup past the expire window", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "running",
    });
    await jobsRepo.update(db, job.id, {
      updatedAt: new Date(Date.now() - 48 * 3600 * 1000),
    });

    const failedCount = await runDomain(reconcileStaleJobsEffect());
    expect(failedCount).toBeGreaterThan(0);

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
  });

  it("leaves a running job inside the expire window", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "running",
    });
    await jobsRepo.update(db, job.id, { updatedAt: new Date() });

    const failedCount = await runDomain(reconcileStaleJobsEffect());
    expect(failedCount).toBe(0);
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("running");
  });
});

describe("reconcileStuckPlaybookRuns", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("enqueues the next step when advance was skipped after success", async () => {
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

    const recovered = await runDomain(reconcileStuckPlaybookRunsEffect());
    expect(recovered).toBe(1);

    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    const next = members.filter((j) => j.playbookStep === 1);
    expect(next).toHaveLength(1);
    expect(next[0]?.status).toBe("queued");
  });

  it("skips runs that still have open jobs", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "example.com" },
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      status: "queued",
      playbookRunId: run.id,
      playbookStep: 0,
      input: { host: "example.com" },
    });

    const recovered = await runDomain(reconcileStuckPlaybookRunsEffect());
    expect(recovered).toBe(0);
  });
});

describe("runFailedPath", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("marks a queued job failed", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "queued" });

    await Effect.runPromise(
      runFailedPathEffect({
        jobId: job.id,
        error: new Error("boom"),
        jobLog: createJobLog(),
        playbookRunId: job.playbookRunId,
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
  });

  it("cancels blocked playbook siblings when a step fails", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "url-capture",
      seed: {
        url: "https://mailhost.test/",
        evidenceId: "00000000-0000-4000-8000-00000000e001",
      },
    });
    const failed = await seedJob(db, cased.id, {
      capabilityId: "network.url.enrich",
      status: "running",
      playbookRunId: run.id,
      playbookStep: 0,
    });
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "blocked",
      playbookRunId: run.id,
      playbookStep: 1,
    });

    await Effect.runPromise(
      runFailedPathEffect({
        jobId: failed.id,
        error: new Error("enrich failed"),
        jobLog: createJobLog(),
        playbookRunId: run.id,
      })
    );

    const sibling = await jobsRepo.get(db, blocked.id);
    expect(sibling?.status).toBe("cancelled");
    const playbook = await playbookRunsRepo.get(db, run.id);
    expect(playbook?.status).toBe("finished");
  });
});

describe("runSucceededPath", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("stores cap_cache when TTL and hash are set", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const jobLog = createJobLog();
    const collected = fakeCollected(jobLog);

    await Effect.runPromise(
      runSucceededPathEffect({
        jobId: job.id,
        state: await dnsState(job.id),
        collected,
        resultSummary: "ok",
        interpretError: null,
        jobLog,
      })
    );

    const hit = await capCacheRepo.lookupActive(
      db,
      cased.id,
      "network.dns.lookup",
      "input-hash-1",
      new Date()
    );
    expect(hit?.jobId).toBe(job.id);
  });

  it("skips cache when interpretError is set", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const jobLog = createJobLog();
    const collected = fakeCollected(jobLog);

    await Effect.runPromise(
      runSucceededPathEffect({
        jobId: job.id,
        state: await dnsState(job.id),
        collected,
        resultSummary: null,
        interpretError: "bad report",
        jobLog,
      })
    );

    const hit = await capCacheRepo.lookupActive(
      db,
      cased.id,
      "network.dns.lookup",
      "input-hash-1",
      new Date()
    );
    expect(hit).toBeNull();
  });

  it("skips cache on a cache-hit collect", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const jobLog = createJobLog();
    const collected = fakeCollected(jobLog, { fromCache: true });

    await Effect.runPromise(
      runSucceededPathEffect({
        jobId: job.id,
        state: await dnsState(job.id),
        collected,
        resultSummary: "ok",
        interpretError: null,
        jobLog,
      })
    );

    const hit = await capCacheRepo.lookupActive(
      db,
      cased.id,
      "network.dns.lookup",
      "input-hash-1",
      new Date()
    );
    expect(hit).toBeNull();
  });

  it("skips cache on a reclaim collect", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });
    const jobLog = createJobLog();
    const collected = fakeCollected(jobLog, { reclaim: true });

    await Effect.runPromise(
      runSucceededPathEffect({
        jobId: job.id,
        state: await dnsState(job.id),
        collected,
        resultSummary: "ok",
        interpretError: null,
        jobLog,
      })
    );

    const hit = await capCacheRepo.lookupActive(
      db,
      cased.id,
      "network.dns.lookup",
      "input-hash-1",
      new Date()
    );
    expect(hit).toBeNull();
  });

  it("releases a pre-inserted blocked step via runSucceededPath", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "url-capture",
      seed: {
        url: "https://mailhost.test/",
        evidenceId: "00000000-0000-4000-8000-00000000e001",
      },
    });
    const first = await seedJob(db, cased.id, {
      capabilityId: "network.url.enrich",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      input: { url: "https://example.com/" },
    });
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "blocked",
      playbookRunId: run.id,
      playbookStep: 1,
    });
    const jobLog = createJobLog();
    const collected = fakeCollected(jobLog);

    await Effect.runPromise(
      runSucceededPathEffect({
        jobId: first.id,
        state: await dnsState(first.id),
        collected,
        resultSummary: "ok",
        interpretError: null,
        jobLog,
      })
    );

    const next = await jobsRepo.get(db, blocked.id);
    expect(next?.status).toBe("queued");
  });

  it("creates the next linear step via runSucceededPath when no row exists", async () => {
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
    const jobLog = createJobLog();
    const collected = fakeCollected(jobLog);

    await Effect.runPromise(
      runSucceededPathEffect({
        jobId: first.id,
        state: await dnsState(first.id),
        collected,
        resultSummary: "ok",
        interpretError: null,
        jobLog,
      })
    );

    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    const next = members.filter((j) => j.playbookStep === 1);
    expect(next).toHaveLength(1);
    expect(next[0]?.capabilityId).toBe("network.whois.lookup");
    expect(next[0]?.status).toBe("queued");
  });
});

describe("advancePlaybookRunEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("creates the next linear step when no blocked row exists", async () => {
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

  it("releases a pre-inserted blocked step instead of inserting a duplicate", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "url-capture",
      seed: {
        url: "https://mailhost.test/",
        evidenceId: "00000000-0000-4000-8000-00000000e001",
      },
    });
    await seedJob(db, cased.id, {
      capabilityId: "network.url.enrich",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
    });
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "blocked",
      playbookRunId: run.id,
      playbookStep: 1,
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const next = await jobsRepo.get(db, blocked.id);
    expect(next?.status).toBe("queued");
    expect(next?.id).toBe(blocked.id);
    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    expect(members.filter((j) => j.playbookStep === 1)).toHaveLength(1);
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

  it("cancels leftover blocked rows when the run is abandoned", async () => {
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
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "blocked",
      playbookRunId: run.id,
      playbookStep: 1,
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const cancelled = await jobsRepo.get(db, blocked.id);
    const finishedRun = await playbookRunsRepo.get(db, run.id);
    expect(cancelled?.status).toBe("cancelled");
    expect(finishedRun?.status).toBe("finished");
  });

  it("binds host-contacts harvest evidenceId from WHOIS Job evidenceIds", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-contacts",
    });
    const whoisEvidenceId = "00000000-0000-4000-8000-00000000aaa1";
    await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 0,
      evidenceIds: [whoisEvidenceId],
    });
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "blocked",
      playbookRunId: run.id,
      playbookStep: 1,
      input: {},
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const harvest = await jobsRepo.get(db, blocked.id);
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
    const blocked = await seedJob(db, cased.id, {
      capabilityId: "threat.hashlookup.lookup",
      status: "blocked",
      playbookRunId: run.id,
      playbookStep: 1,
      input: {},
    });

    await runDomain(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: run.id,
      })
    );

    const lookup = await jobsRepo.get(db, blocked.id);
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
    await jobsRepo.update(db, firstDns.id, { status: "succeeded" });
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
    await jobsRepo.update(db, failed.id, { status: "failed" });
    await runDomain(advancePlaybookRunEffect({ playbookRunId: run.id }));
    const siblingRow = await jobsRepo.get(db, sibling.id);
    expect(siblingRow?.status).toBe("queued");
  });
});
