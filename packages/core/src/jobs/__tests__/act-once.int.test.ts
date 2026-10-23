import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, jobsRepo } from "@watchdog/db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  backdateJob,
  listAllActivity,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
  twoWriters,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store.ts";
import { Db } from "../../infra/db-service.ts";
import { runDomainWith } from "../../infra/run-domain.ts";
import { vaultLayer } from "../../infra/vault.ts";
import { JobFibers } from "../job-fibers.ts";
import { recordingJobQueue } from "../job-queue.ts";
import { ACT_LOST_MESSAGE } from "../lanes.ts";
import { reconcileJobsEffect } from "../lifecycle/reconcile.ts";
import { executeJobOnMap } from "../run-job.ts";

const ACT_CAP = "archive.url.submit";
const DAY = 24 * 3_600_000;

// Counts how often the act Cap's body runs; everything else is real.
const actRuns = vi.hoisted(() => ({ count: 0 }));

vi.mock("@watchdog/caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...actual,
    requireCapability: (id: string) => {
      const cap = actual.requireCapability(id);
      if (id !== ACT_CAP) return cap;
      return {
        ...cap,
        run: (ctx: Parameters<typeof cap.run>[0]) =>
          Effect.sync(() => {
            actRuns.count += 1;
          }).pipe(
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

/** One delivery: its own worker services, as a second worker process would have. */
function deliver(jobId: string) {
  const services = Layer.mergeAll(
    Layer.provideMerge(vaultLayer, Db.layer),
    recordingBlobStore().layer,
    outboundClientLayer,
    JobFibers.layer,
    recordingJobQueue().layer
  );
  return Effect.runPromise(
    executeJobOnMap(jobId).pipe(Effect.provide(services), Effect.scoped)
  );
}

async function entriesOf(jobId: string) {
  return (await listAllActivity())
    .filter((row) => row.kind === "job" && row.subjectId === jobId)
    .map((row) => row.toValue);
}

async function seedAct(status: "queued" | "running") {
  const cased = await seedCase(db, { allowThirdPartyEgress: true });
  return seedJob(db, cased.id, {
    capabilityId: ACT_CAP,
    input: { url: "https://example.com/page" },
    status,
  });
}

describe("an act Job runs at most once (#478)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd478-key" });
    actRuns.count = 0;
  });

  it("starts a queued Job once when two deliveries race for it", async () => {
    const job = await seedAct("queued");
    const race = twoWriters({ pauseAt: "locked" });
    race.pauseAfter(jobsRepo, "lockStatus", "locked");

    const outcome = await race.run({
      a: () => deliver(job.id),
      b: () => deliver(job.id),
    });

    expect(outcome.bBlocked).toBe(true);
    expect(outcome.a.status).toBe("fulfilled");
    expect(outcome.b.status).toBe("fulfilled");
    expect(actRuns.count).toBe(1);
    expect((await entriesOf(job.id)).filter((to) => to === "running")).toEqual([
      "running",
    ]);
  });

  it("leaves a running Job alone when a second delivery arrives", async () => {
    const job = await seedAct("running");
    const before = await entriesOf(job.id);

    await deliver(job.id);

    expect(actRuns.count).toBe(0);
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("running");
    expect(row?.error).toBeNull();
    expect(await entriesOf(job.id)).toEqual(before);
  });

  it("fails a lost act Job in reconcile with the act message, and never requeues it", async () => {
    const job = await seedAct("running");
    await backdateJob(db, job.id, {
      startedAt: new Date(Date.now() - 2 * DAY),
      updatedAt: new Date(Date.now() - 2 * DAY),
    });
    const queue = recordingJobQueue();
    const run = runDomainWith(Layer.mergeAll(Db.layer, queue.layer));

    const result = await run(reconcileJobsEffect());

    expect(result).toMatchObject({ stale: 1 });
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.error).toBe(ACT_LOST_MESSAGE);
    expect(queue.sends).toEqual([]);
    expect(actRuns.count).toBe(0);
  });
});
