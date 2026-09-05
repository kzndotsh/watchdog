import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import {
  cancelPlaybookRunEffect,
  dumpUrlEffect,
  runPlaybookEffect,
  runDomain,
} from "@watchdog/core";
import { casesRepo, db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { resetTestDb, seedCase, seedJob } from "@watchdog/test-kit/db";

import { advancePlaybookRunEffect } from "../stages/chain.ts";

describe("runPlaybook", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("inserts a running playbook and queues only the first step", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        sourceUrl: "https://mailhost.test/",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    const result = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        playbookId: "url-capture",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        seed: {
          url: "https://mailhost.test/",
          evidenceId: dumped.id,
        },
      })
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.status).toBe("queued");

    const run = await playbookRunsRepo.get(db, result.playbookRunId);
    expect(run?.status).toBe("running");
  });

  it("host-footprint queues only the first DNS step", async () => {
    const cased = await seedCase(db);
    const result = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.capabilityId).toBe("network.dns.lookup");
    expect(result.jobs[0]?.status).toBe("queued");

    const run = await playbookRunsRepo.get(db, result.playbookRunId);
    expect(run?.status).toBe("running");
  });

  it("throws before insert when extract.ai credentials are missing", async () => {
    const cased = await seedCase(db);
    await casesRepo.update(db, cased.id, cased.organizationId, {
      allowThirdPartyEgress: true,
    });
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        sourceUrl: "https://mailhost.test/",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    await expect(
      runDomain(
        runPlaybookEffect({
          caseId: cased.id,
          playbookId: "url-capture-ai",
          actorId: TEST_ACTOR_ID,
          actorLabel: TEST_ACTOR_ID,
          seed: {
            url: "https://mailhost.test/",
            evidenceId: dumped.id,
          },
        })
      )
    ).rejects.toThrow(/credential/i);

    const jobs = await jobsRepo.listForCase(db, cased.id);
    expect(jobs).toHaveLength(0);
  });

  it("host-enumerate inserts only the CT job (fan-out is not pre-inserted)", async () => {
    const cased = await seedCase(db);
    const result = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        playbookId: "host-enumerate",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.capabilityId).toBe("network.ct.lookup");
    expect(result.jobs[0]?.status).toBe("queued");
  });

  it("url-capture harvest input stays the seed evidenceId", async () => {
    const cased = await seedCase(db);
    const dumped = await runDomain(
      dumpUrlEffect({
        caseId: cased.id,
        sourceUrl: "https://mailhost.test/",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
      })
    );
    const result = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        playbookId: "url-capture",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        seed: {
          url: "https://mailhost.test/",
          evidenceId: dumped.id,
        },
      })
    );
    const enrich = result.jobs[0];
    expect(enrich?.capabilityId).toBe("network.url.enrich");
    if (enrich === undefined) throw new TypeError("expected enrich job");
    await jobsRepo.update(db, enrich.id, { status: "succeeded" });
    await Effect.runPromise(
      advancePlaybookRunEffect({
        caseId: cased.id,
        playbookRunId: result.playbookRunId,
      })
    );
    const members = await jobsRepo.listForPlaybookRun(db, result.playbookRunId);
    const harvest = members.find((j) => j.capabilityId === "evidence.harvest");
    expect(harvest?.input).toMatchObject({ evidenceId: dumped.id });
  });
});

describe("cancelPlaybookRun", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("cancels the run and its cancellable members", async () => {
    const cased = await seedCase(db);
    const started = await runDomain(
      runPlaybookEffect({
        caseId: cased.id,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        actorLabel: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    await seedJob(db, cased.id, {
      capabilityId: "network.whois.lookup",
      status: "blocked",
      playbookRunId: started.playbookRunId,
      playbookStep: 1,
    });

    const cancelled = await runDomain(
      cancelPlaybookRunEffect(cased.id, started.playbookRunId)
    );
    expect(cancelled.cancelledJobIds.length).toBeGreaterThan(0);

    const run = await playbookRunsRepo.get(db, started.playbookRunId);
    expect(run?.status).toBe("cancelled");

    const members = await jobsRepo.listForPlaybookRun(
      db,
      started.playbookRunId
    );
    expect(members.some((j) => j.status === "blocked")).toBe(false);
  });
});
