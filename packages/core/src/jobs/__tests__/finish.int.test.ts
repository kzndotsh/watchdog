import { Effect } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { requireCapability } from "@watchdog/caps";
import { cancelJobEffect, runDomain } from "@watchdog/core";
import { db, evidenceRepo, jobsRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/test-kit";
import {
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
} from "@watchdog/test-kit/db";

import { finishEffect } from "../stages/finish.ts";
import { createJobLog } from "../stages/helpers.ts";
import type { PreflightState } from "../stages/preflight.ts";

async function harvestState(jobId: string): Promise<PreflightState> {
  const job = await jobsRepo.get(db, jobId);
  if (!job) throw new Error("job missing");
  const cap = requireCapability("evidence.harvest");
  return {
    jobId,
    job,
    cap,
    policy: { markEvidenceProcessed: true, ...cap.jobPolicy },
    input: job.input,
    allowThirdPartyEgress: false,
    reclaimArtifacts: null,
    reclaimEvidenceIds: [],
  };
}

describe("finish", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("skips succeeded when the job is cancelled first", async () => {
    const cased = await seedCase(db);
    const job = await seedJob(db, cased.id, { status: "running" });

    await runDomain(cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id));
    const outcome = await Effect.runPromise(
      finishEffect({
        state: await harvestState(job.id),
        jobLog: createJobLog(),
        proposalId: null,
        resultSummary: "done",
        fromCache: false,
        suppressedCount: 0,
        interpretError: null,
        markSourceProcessed: false,
      })
    );
    expect(outcome).toBe("cancelled");
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
  });

  it("stamps processedAt when policy and markSourceProcessed say so", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const job = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "running",
      input: { evidenceId: evidence.id },
    });

    const outcome = await Effect.runPromise(
      finishEffect({
        state: await harvestState(job.id),
        jobLog: createJobLog(),
        proposalId: null,
        resultSummary: "harvested",
        fromCache: false,
        suppressedCount: 0,
        interpretError: null,
        markSourceProcessed: true,
      })
    );
    expect(outcome).toBe("succeeded");

    const rows = await evidenceRepo.listForCase(db, cased.id);
    const landed = rows.find((row) => row.id === evidence.id);
    expect(landed?.processedAt).not.toBeNull();
  });
});
