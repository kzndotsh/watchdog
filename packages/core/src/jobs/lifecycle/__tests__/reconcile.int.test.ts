import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { Db, runDomainWith, transact } from "@watchdog/core/infra";
import { jobsRepo, tryLockJobReconcile } from "@watchdog/db";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  backdateJob,
  countJobDeliveries,
  deleteJobDeliveries,
  listAllActivity,
  removeOrganizationMember,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
  setJobDeliveryState,
  testDb as db,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { enqueueCapJobEffect } from "../../boss.ts";
import { jobQueueProducerLayer, recordingJobQueue } from "../../job-queue.ts";
import { reconcileJobsEffect } from "../reconcile.ts";

const DAY = 24 * 3_600_000;

function tickWith(queue: ReturnType<typeof recordingJobQueue>) {
  const run = runDomainWith(Layer.mergeAll(Db.layer, queue.layer));
  return () => run(reconcileJobsEffect());
}

/** Seed a queued Job with a real pg-boss delivery, committed together as a start would. */
async function seedQueuedWithDelivery(caseId: Parameters<typeof seedJob>[1]) {
  const job = await seedJob(db, caseId, {
    capabilityId: "network.dns.lookup",
    status: "queued",
  });
  await Effect.runPromise(
    transact((tx) => enqueueCapJobEffect(tx, job.id, job.capabilityId)).pipe(
      Effect.provide(Layer.mergeAll(Db.layer, jobQueueProducerLayer))
    )
  );
  expect(await countJobDeliveries(db, job.id)).toBe(1);
  return job;
}

let seededEntries = 0;

async function allJobEntries(): Promise<number> {
  const rows = await listAllActivity();
  return rows.filter((row) => row.kind === "job").length;
}

/** Seeding may append entries: call after seeding so `jobEntryCount` counts only the repairs. */
async function markEntries(): Promise<void> {
  seededEntries = await allJobEntries();
}

async function jobEntryCount(): Promise<number> {
  return (await allJobEntries()) - seededEntries;
}

async function seedStaleRunning(caseId: Parameters<typeof seedJob>[1]) {
  const job = await seedJob(db, caseId, {
    capabilityId: "network.dns.lookup",
    status: "running",
  });
  await backdateJob(db, job.id, { updatedAt: new Date(Date.now() - 2 * DAY) });
  return job;
}

describe("reconcileJobsEffect", () => {
  beforeEach(async () => {
    await resetTestDb();
    // `auth.*` survives resetTestDb: start from a member, an unbanned user and no key.
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd435-key" });
  });

  describe("stale Jobs", () => {
    it("fails a running Job past its Cap's window with the stale code, once", async () => {
      const cased = await seedCase(db);
      const job = await seedStaleRunning(cased.id);
      await markEntries();
      const tick = tickWith(recordingJobQueue());

      const first = await tick();
      expect(first).toMatchObject({ ran: true, stale: 1, accessRevoked: 0 });
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("failed");
      expect(row?.errorCode).toBe("stale");
      expect(await jobEntryCount()).toBe(1);

      const second = await tick();
      expect(second).toMatchObject({ ran: true, stale: 0, accessRevoked: 0 });
      expect(await jobEntryCount()).toBe(1);
      expect(await jobsRepo.get(db, job.id)).toEqual(row);
    });

    it("leaves a running Job inside its window", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        capabilityId: "network.dns.lookup",
        status: "running",
      });
      await markEntries();
      const result = await tickWith(recordingJobQueue())();
      expect(result).toMatchObject({ stale: 0, accessRevoked: 0 });
      expect((await jobsRepo.get(db, job.id))?.status).toBe("running");
      expect(await jobEntryCount()).toBe(0);
    });

    it("reclaims from startedAt when updatedAt was refreshed mid-run", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        capabilityId: "network.dns.lookup",
        status: "running",
      });
      await backdateJob(db, job.id, {
        startedAt: new Date(Date.now() - 2 * DAY),
        updatedAt: new Date(),
      });
      await markEntries();
      const result = await tickWith(recordingJobQueue())();
      expect(result.stale).toBe(1);
      expect((await jobsRepo.get(db, job.id))?.status).toBe("failed");
    });

    it("fails a running Job of an unknown Capability as preflight_failed", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        capabilityId: "no.such.cap",
        status: "running",
      });
      await markEntries();
      await tickWith(recordingJobQueue())();
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("failed");
      expect(row?.errorCode).toBe("preflight_failed");
    });
  });

  describe("two reconciles at once", () => {
    it("repair each Job once", async () => {
      const cased = await seedCase(db);
      const jobs = await Promise.all(
        Array.from({ length: 6 }, () => seedStaleRunning(cased.id))
      );
      await markEntries();
      const queue = recordingJobQueue();
      const [a, b] = await Promise.all([tickWith(queue)(), tickWith(queue)()]);

      expect(a.stale + b.stale).toBe(jobs.length);
      expect(await jobEntryCount()).toBe(jobs.length);
      const rows = await Promise.all(
        jobs.map((job) => jobsRepo.get(db, job.id))
      );
      expect(rows.map((row) => row?.status)).toEqual(jobs.map(() => "failed"));
    });

    it("skips the tick while another worker holds the lock", async () => {
      const cased = await seedCase(db);
      const job = await seedStaleRunning(cased.id);
      await markEntries();
      const tick = tickWith(recordingJobQueue());

      const skipped = await db.transaction(async (tx) => {
        expect(await tryLockJobReconcile(tx)).toBe(true);
        return tick();
      });

      expect(skipped.ran).toBe(false);
      expect((await jobsRepo.get(db, job.id))?.status).toBe("running");
      // The lock went with the transaction: the next tick repairs.
      expect((await tick()).stale).toBe(1);
    });
  });

  describe("Case access recheck", () => {
    it("cancels a running Job whose creator left the organization, in one tick", async () => {
      const cased = await seedCase(db);
      const job = await seedJob(db, cased.id, {
        capabilityId: "network.dns.lookup",
        status: "running",
      });
      await markEntries();
      const tick = tickWith(recordingJobQueue());
      expect((await tick()).accessRevoked).toBe(0);

      await removeOrganizationMember(db, {
        organizationId: TEST_ORGANIZATION_ID,
        userId: TEST_ACTOR_ID,
      });
      const result = await tick();

      expect(result).toMatchObject({ stale: 0, accessRevoked: 1 });
      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("cancelled");
      expect(row?.errorCode).toBe("access_revoked");
      expect(row?.finishedAt).not.toBeNull();
      expect(await jobEntryCount()).toBe(1);

      expect((await tick()).accessRevoked).toBe(0);
      expect(await jobEntryCount()).toBe(1);
    });
  });

  describe("stuck playbook runs", () => {
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

      await markEntries();
      const result = await tickWith(recordingJobQueue())();
      expect(result.stuckPlaybooks).toBe(1);

      const members = await jobsRepo.listForPlaybookRun(db, run.id);
      const next = members.filter((j) => j.playbookStep === 1);
      expect(next).toHaveLength(1);
      expect(next[0]?.status).toBe("queued");
    });

    it("skips runs that still have open Jobs", async () => {
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
      await markEntries();
      const result = await tickWith(recordingJobQueue())();
      expect(result.stuckPlaybooks).toBe(0);
    });
  });

  describe("queued Jobs whose delivery ended or is gone", () => {
    it("fails a queued Job whose delivery failed, completed, was cancelled or is missing, once", async () => {
      const cased = await seedCase(db);
      const failed = await seedQueuedWithDelivery(cased.id);
      const completed = await seedQueuedWithDelivery(cased.id);
      const cancelled = await seedQueuedWithDelivery(cased.id);
      const missing = await seedQueuedWithDelivery(cased.id);
      await setJobDeliveryState(db, failed.id, "failed");
      await setJobDeliveryState(db, completed.id, "completed");
      await setJobDeliveryState(db, cancelled.id, "cancelled");
      await deleteJobDeliveries(db, missing.id);
      await markEntries();
      const tick = tickWith(recordingJobQueue());

      const first = await tick();
      expect(first.undelivered).toBe(4);
      for (const job of [failed, completed, cancelled, missing]) {
        // oxlint-disable-next-line no-await-in-loop -- four reads, one after the other
        const row = await jobsRepo.get(db, job.id);
        expect(row).toMatchObject({ status: "failed", errorCode: "orphaned" });
        expect(row?.error).toMatch(/delivery/);
        expect(row?.finishedAt).not.toBeNull();
      }
      expect(await jobEntryCount()).toBe(4);

      const second = await tick();
      expect(second.undelivered).toBe(0);
      expect(await jobEntryCount()).toBe(4);
    }, 30_000);

    it("leaves a queued Job with a pending delivery alone, and never sends", async () => {
      const cased = await seedCase(db);
      const created = await seedQueuedWithDelivery(cased.id);
      const retry = await seedQueuedWithDelivery(cased.id);
      const active = await seedQueuedWithDelivery(cased.id);
      await setJobDeliveryState(db, retry.id, "retry");
      await setJobDeliveryState(db, active.id, "active");
      await markEntries();
      const queue = recordingJobQueue();

      const result = await tickWith(queue)();

      expect(result.undelivered).toBe(0);
      expect(queue.sends).toHaveLength(0);
      for (const job of [created, retry, active]) {
        // oxlint-disable-next-line no-await-in-loop -- three reads, one after the other
        expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
      }
      expect(await jobEntryCount()).toBe(0);
    }, 30_000);
  });
});
