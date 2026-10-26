import { Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Db, runDomainWith } from "@watchdog/core/infra";
import { db, jobsRepo } from "@watchdog/db";
import { createLogger } from "@watchdog/log";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  clearCollectQueueStale,
  collectQueueDiff,
  listCollectQueueStale,
  readCollectQueue,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
  seedOrganizationMember,
  withCollectQueueFault,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { recordingJobQueue } from "../../job-queue.ts";
import { reconcileJobsEffect } from "../reconcile.ts";
import { settleJobEffect } from "../settle.ts";

vi.mock("@watchdog/log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/log")>();
  return { ...actual, createLogger: vi.fn(actual.createLogger) };
});

/*
 * Collect's queue projection (#574) must never fail the write it follows. A flush that raises
 * (a test-only fault swapped into the private database) leaves the settle committed and the Case
 * logged as stale; the next reconcile tick rebuilds the Case and logs `collect_queue.drift`.
 */

const run = runDomainWith(Layer.mergeAll(Db.layer, recordingJobQueue().layer));

describe("Collect queue failure policy", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd574-key" });
    vi.mocked(createLogger).mockClear();
  });

  it("commits a settle whose flush fails, marks the Case stale, and the tick repairs it", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id);
    const job = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "running",
      input: { evidenceId: evidence.id },
    });
    expect(await collectQueueDiff(db, cased.id)).toEqual([]);

    const settled = await withCollectQueueFault(() =>
      run(
        settleJobEffect(
          { jobId: job.id, caseId: cased.id },
          { kind: "succeed" },
          { resultSummary: "harvested", finishedAt: new Date() }
        )
      )
    );

    // The writer committed; the projection did not move; the Case is logged.
    expect(settled?.status).toBe("succeeded");
    expect((await jobsRepo.get(db, job.id))?.status).toBe("succeeded");
    expect(await listCollectQueueStale()).toEqual([
      { caseId: cased.id, error: "collect_queue test fault" },
    ]);
    expect(await collectQueueDiff(db, cased.id)).not.toEqual([]);

    const result = await run(reconcileJobsEffect());

    expect(result).toMatchObject({ ran: true, collectQueueRebuilt: 1 });
    expect(await listCollectQueueStale()).toEqual([]);
    expect(await collectQueueDiff(db, cased.id)).toEqual([]);
    const row = (await readCollectQueue(db, cased.id)).find(
      (r) => r.id === evidence.id
    );
    expect(row?.members).toEqual([job.id]);
    expect(row?.searchText).toContain("harvested");
    expect(vi.mocked(createLogger)).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "collect_queue.drift",
        caseId: cased.id,
        reason: "stale",
      })
    );

    // A second tick finds nothing to repair.
    expect(await run(reconcileJobsEffect())).toMatchObject({
      collectQueueRebuilt: 0,
    });
  });

  it("rebuilds a Case the counts find out of step, with no stale mark (fingerprint)", async () => {
    const cased = await seedCase(db);
    await seedEvidence(db, cased.id);
    await seedJob(db, cased.id, { status: "running" });
    // An Evidence row captured while every flush fails, and its stale mark lost.
    await withCollectQueueFault(() =>
      seedEvidence(db, cased.id, { label: "captured while broken" })
    );
    await clearCollectQueueStale();
    expect(await collectQueueDiff(db, cased.id)).not.toEqual([]);

    const result = await run(reconcileJobsEffect());

    expect(result.collectQueueRebuilt).toBe(1);
    expect(await collectQueueDiff(db, cased.id)).toEqual([]);
    expect(vi.mocked(createLogger)).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "collect_queue.drift",
        caseId: cased.id,
        reason: "fingerprint",
      })
    );
  });
});
