import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { JobLane } from "@watchdog/caps/sdk";
import { db, jobsRepo } from "@watchdog/db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store.ts";
import { Db } from "../../infra/db-service.ts";
import { vaultLayer } from "../../infra/vault.ts";
import { enqueueCapJobEffect } from "../boss.ts";
import { JobFibers } from "../job-fibers.ts";
import { JobQueue, jobQueueWorkerLayer } from "../job-queue.ts";
import { workLanesEffect } from "../lanes.ts";
import { executeJobOnMap } from "../run-job.ts";

const QUICK_CAP = "network.dns.lookup";
// Flagged `slow`, so its descriptor puts it in the heavy lane.
const HEAVY_CAP = "archive.commoncrawl.lookup";

// The two Caps with their network call swapped for a result that holds until the test
// releases it (heavy) or comes back at once (quick). Everything else (preflight, status
// writes, finish, the queue and its lanes) is real.
const heavyGate = vi.hoisted(() => {
  let release = () => {};
  let gate = Promise.resolve();
  return {
    reset() {
      gate = new Promise<void>((resolve) => {
        release = resolve;
      });
    },
    release: () => {
      release();
    },
    wait: () => gate,
  };
});

vi.mock("@watchdog/caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...actual,
    requireCapability: (id: string) => {
      const cap = actual.requireCapability(id);
      if (id !== QUICK_CAP && id !== HEAVY_CAP) return cap;
      return {
        ...cap,
        run: (ctx: Parameters<typeof cap.run>[0]) =>
          Effect.promise(() =>
            id === HEAVY_CAP ? heavyGate.wait() : Promise.resolve()
          ).pipe(
            Effect.andThen(
              ctx.uploadArtifact({
                bytes: new TextEncoder().encode("{}"),
                mime: "application/json",
                name: REPORT_JSON_ARTIFACT,
              })
            ),
            Effect.map((artifact) => ({ artifacts: [artifact] }))
          ),
      };
    },
  };
});

const services = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  recordingBlobStore().layer,
  outboundClientLayer,
  JobFibers.layer
);
const live = Layer.mergeAll(services, jobQueueWorkerLayer);

async function statusOf(jobId: string) {
  return (await jobsRepo.get(db, jobId))?.status;
}

async function untilStatus(jobId: string, status: string) {
  await vi.waitFor(
    async () => {
      expect(await statusOf(jobId)).toBe(status);
    },
    { timeout: 20_000, interval: 50 }
  );
}

/** Seed and enqueue one Job of a Cap on the real lane routing. */
function startJob(caseId: CaseId, capabilityId: string, host: string) {
  return Effect.gen(function* startJobGen() {
    const job = yield* Effect.promise(() =>
      seedJob(db, caseId, { capabilityId, input: { host } })
    );
    yield* enqueueCapJobEffect(job.id, capabilityId);
    return job.id;
  });
}

/** Run `body` with the worker's handler on every lane at the given concurrency. */
function withLanes(
  concurrency: (lane: JobLane) => number,
  body: Effect.Effect<void, unknown, JobQueue>
) {
  return Effect.gen(function* withLanesGen() {
    const context = yield* Effect.context<
      Db | JobFibers | JobQueue | Layer.Success<typeof services>
    >();
    const runJob = Effect.runPromiseWith(context);
    yield* workLanesEffect(
      (jobs) =>
        runJob(
          Effect.forEach(
            jobs,
            (job) => executeJobOnMap((job.data as { jobId: string }).jobId),
            { discard: true }
          )
        ).then(() => undefined),
      { pollingIntervalSeconds: 0.5, concurrency }
    );
    yield* body;
  }).pipe(Effect.provide(live), Effect.scoped, Effect.runPromise);
}

describe("worker lanes (#478)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd478-key" });
    heavyGate.reset();
  });

  it("runs a quick Job to the end while a slow heavy Job holds the heavy lane", async () => {
    const cased = await seedCase(db);
    try {
      await withLanes(
        () => 1,
        Effect.gen(function* quickBesideHeavyGen() {
          const slow = yield* startJob(cased.id, HEAVY_CAP, "slow.wd478.test");
          const queuedBehind = yield* startJob(
            cased.id,
            HEAVY_CAP,
            "behind.wd478.test"
          );
          yield* Effect.promise(() => untilStatus(slow, "running"));
          const quick = yield* startJob(cased.id, QUICK_CAP, "fast.wd478.test");

          yield* Effect.promise(async () => {
            await untilStatus(quick, "succeeded");
            // The quick Job finished while the heavy Job was still running, and the
            // second heavy Job waits for the heavy lane's one slot.
            expect(await statusOf(slow)).toBe("running");
            expect(await statusOf(queuedBehind)).toBe("queued");
          });

          yield* Effect.sync(() => {
            heavyGate.release();
          });
          yield* Effect.promise(async () => {
            await untilStatus(slow, "succeeded");
            await untilStatus(queuedBehind, "succeeded");
          });
        })
      );
    } finally {
      heavyGate.release();
    }
  }, 60_000);

  it("runs as many heavy Jobs at once as the lane's concurrency says", async () => {
    const cased = await seedCase(db);
    try {
      await withLanes(
        (lane) => (lane === "heavy" ? 2 : 1),
        Effect.gen(function* twoHeavyGen() {
          const first = yield* startJob(cased.id, HEAVY_CAP, "one.wd478.test");
          const second = yield* startJob(cased.id, HEAVY_CAP, "two.wd478.test");
          const third = yield* startJob(
            cased.id,
            HEAVY_CAP,
            "three.wd478.test"
          );
          yield* Effect.promise(async () => {
            await untilStatus(first, "running");
            await untilStatus(second, "running");
            // Two slots: the third waits.
            expect(await statusOf(third)).toBe("queued");
          });
          yield* Effect.sync(() => {
            heavyGate.release();
          });
          yield* Effect.promise(async () => {
            await untilStatus(third, "succeeded");
          });
        })
      );
    } finally {
      heavyGate.release();
    }
  }, 60_000);
});
