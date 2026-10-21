import { Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PlaybookDef } from "@watchdog/caps";
import { recordingBlobStore } from "@watchdog/core/blob";
import { Db, runDomainWith } from "@watchdog/core/infra";
import {
  recordingJobQueue,
  retryJobEffect,
  runPlaybookEffect,
} from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { activityLogRepo, db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import { resetTestDb, seedCase } from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { settleJobEffect } from "../lifecycle/settle.ts";
import { advancePlaybookTailEffect } from "../lifecycle/tail.ts";
import { advancePlaybookRunEffect } from "../stages/chain.ts";

/** One step, so the run finishes the moment that step's Job does. */
const SINGLE: PlaybookDef = {
  id: "run-activity-single",
  title: "Run activity single",
  description: "One step.",
  seedKinds: ["host"],
  steps: ["network.dns.lookup"],
};

vi.mock("@watchdog/caps", async (importOriginal) => {
  const original = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...original,
    requirePlaybook: (id: string) =>
      id === "run-activity-single" ? SINGLE : original.requirePlaybook(id),
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

const START = { xid: "0", id: 0 } as const;
const APPEND_FAILURE = "append failed";

type Cased = Awaited<ReturnType<typeof seedCase>>;

async function runEntries() {
  const rows = await activityLogRepo.drain(db, { after: START, limit: 1000 });
  return rows.filter((row) => row.kind === "playbook_run");
}

async function startRun(cased: Cased) {
  const started = await runDomain(
    runPlaybookEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      playbookId: SINGLE.id,
      actorId: TEST_ACTOR_ID,
      actorLabel: "Run Starter",
      seed: { host: "mailhost.test" },
    })
  );
  return started.playbookRunId;
}

async function stepJob(runId: string) {
  const members = await jobsRepo.listForPlaybookRun(db, runId);
  const job = members.at(-1);
  if (job === undefined) throw new TypeError("expected a step Job");
  return job;
}

/** Settle the latest step Job to a terminal status (the tail has not run). */
async function settleLatest(
  cased: Cased,
  runId: string,
  result: "succeed" | "fail"
) {
  const job = await stepJob(runId);
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
  return target;
}

async function finishRun(
  cased: Cased,
  runId: string,
  result: "succeed" | "fail"
) {
  const target = await settleLatest(cased, runId, result);
  await runDomain(
    advancePlaybookTailEffect({ ...target, playbookRunId: runId })
  );
}

describe("a finished Playbook run appends its activity entry (#456)", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("appends exactly one entry carrying the outcome, the run and its actor", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);
    expect(await runEntries()).toEqual([]);

    await finishRun(cased, runId, "succeed");

    const entries = await runEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      caseId: cased.id,
      kind: "playbook_run",
      action: "finished",
      subjectId: runId,
      groupId: runId,
      toValue: "succeeded",
      label: null,
      actorId: TEST_ACTOR_ID,
      actorLabel: "Run Starter",
    });
  });

  it("a rolled-back finish appends none and leaves the run running", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);
    await settleLatest(cased, runId, "fail");
    const append = vi
      .spyOn(activityLogRepo, "append")
      .mockRejectedValueOnce(new Error(APPEND_FAILURE));
    await expect(
      runDomain(advancePlaybookRunEffect({ playbookRunId: runId }))
    ).rejects.toThrow(APPEND_FAILURE);

    expect(append).toHaveBeenCalledTimes(1);
    expect(await playbookRunsRepo.get(db, runId)).toMatchObject({
      status: "running",
      outcome: null,
      finishedAt: null,
    });
    expect(await runEntries()).toEqual([]);
  });

  it("a retry that re-finishes the run appends a second entry with the new outcome", async () => {
    const cased = await seedCase(db);
    const runId = await startRun(cased);
    await finishRun(cased, runId, "fail");
    const failed = await stepJob(runId);

    await runDomain(
      retryJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        jobId: failed.id,
        actorId: TEST_ACTOR_ID,
      })
    );
    // Reopening the run is not a `playbook_run` entry: its Job entries cover it.
    expect(await runEntries()).toHaveLength(1);

    await finishRun(cased, runId, "succeed");

    const entries = await runEntries();
    expect(entries.map((row) => [row.action, row.toValue])).toEqual([
      ["finished", "failed"],
      ["finished", "succeeded"],
    ]);
  });
});
