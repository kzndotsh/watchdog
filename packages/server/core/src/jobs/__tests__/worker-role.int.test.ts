import { Effect, Layer, Predicate, Result } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { casesRepo, entitiesRepo, jobsRepo, workerRoleDb } from "#db";
import {
  backdateCaseDeletion,
  listAllActivity,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
  testDb as db,
} from "#test-db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/domain/schemas/jobs";
import { EGRESS_CLASSES } from "@watchdog/domain/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/domain/schemas/testing";
import { TEST_ACTOR_ID } from "@watchdog/domain/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { deleteCaseEffect } from "../../case-deletion/tombstone.ts";
import { createEntityEffect } from "../../graph/entities.ts";
import { recordingBlobStore } from "../../infra/blob-store.ts";
import { Db } from "../../infra/db-service.ts";
import { inWorkerRole } from "../../infra/organization-scope.ts";
import { runDomainWith } from "../../infra/run-domain.ts";
import { vaultLayer } from "../../infra/vault.ts";
import {
  ACTIVITY_RESTORE_CHECK,
  MAINTENANCE_TASKS,
} from "../../maintenance/index.ts";
import { JobFibers } from "../job-fibers.ts";
import { recordingJobQueue } from "../job-queue.ts";
import { executeJobEffect } from "../run-job.ts";

/**
 * Issue #720: the worker logs in as `watchdog_worker`, which may write no Graph table. Here the
 * worker's own paths run on a `Db` switched to that role (`workerRoleDb`, what `inWorkerRole`
 * gives an API-key request): a Cap Job from claim to settle and the Playbook's next step, and
 * every maintenance task, succeed; a Graph write fails and writes nothing.
 */

// The DNS Cap with its network call swapped for an artifact upload; preflight, status writes,
// finish and the Playbook chain are real.
vi.mock("@watchdog/caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...actual,
    requireCapability: (id: string) => {
      const cap = actual.requireCapability(id);
      if (id !== "network.dns.lookup") return cap;
      return {
        ...cap,
        run: (ctx: Parameters<typeof cap.run>[0]) =>
          Predicate.hasProperty(ctx.input, "host")
            ? ctx
                .uploadArtifact({
                  bytes: new TextEncoder().encode("{}"),
                  mime: "application/json",
                  name: REPORT_JSON_ARTIFACT,
                })
                .pipe(Effect.map((artifact) => ({ artifacts: [artifact] })))
            : Effect.die(new Error("no host")),
      };
    },
  };
});

const DAY_MS = 86_400_000;

const queue = recordingJobQueue();
const blobs = recordingBlobStore();
/** The worker's services over the worker role. */
const workerDb = Db.layerOf(workerRoleDb(db));
const services = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, workerDb),
  blobs.layer,
  outboundClientLayer,
  queue.layer,
  JobFibers.layer
);

function asWorker<A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof services>>
) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(services), Effect.scoped)
  );
}

/** As the application role (a person's session), for the setup a worker cannot do. */
const asApp = runDomainWith(
  Layer.mergeAll(Db.layerOf(db), blobs.layer, queue.layer)
);

beforeEach(async () => {
  await resetTestDb();
  await seedOrganizationMember(db, {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_ACTOR_ID,
    role: "owner",
  });
  await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd720-key" });
  queue.sends.length = 0;
});

describe("the worker's paths as the worker role (#720)", () => {
  it("runs a Cap Job from claim to settle and starts the Playbook's next step", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "host-footprint",
      seed: { host: "ok.wd720.test" },
    });
    const job = await seedJob(db, cased.id, {
      capabilityId: "network.dns.lookup",
      input: { host: "ok.wd720.test" },
      playbookRunId: run.id,
      playbookStep: 0,
    });

    const outcome = await asWorker(executeJobEffect(job.id));

    expect(outcome).toMatchObject({ outcome: "succeeded" });
    expect((await jobsRepo.get(db, job.id))?.status).toBe("succeeded");
    const steps = await jobsRepo.listForPlaybookRun(db, run.id);
    expect(steps.filter((step) => step.playbookStep === 1)).toHaveLength(1);
    expect(queue.sends.length).toBeGreaterThan(0);
    const entries = await listAllActivity(db);
    expect(
      entries.some((row) => row.kind === "job" && row.subjectId === job.id)
    ).toBe(true);
  });

  it("runs every maintenance task, the purge of an expired Case included", async () => {
    const cased = await seedCase(db, { slug: "expired" });
    await asApp(
      deleteCaseEffect(cased.id, {
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
      })
    );
    const deletedAt = new Date(Date.now() - 40 * DAY_MS);
    await backdateCaseDeletion(db, cased.id, {
      deletedAt,
      purgeAfter: new Date(deletedAt.getTime() + 30 * DAY_MS),
    });

    for (const task of [...MAINTENANCE_TASKS, ACTIVITY_RESTORE_CHECK]) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- one task at a time, as the worker boots them
      const result = await asWorker(Effect.result(task.source()));
      expect(Result.isSuccess(result), task.name).toBe(true);
    }
    expect(
      await casesRepo.getByIdIncludingDeleted(
        db,
        cased.id,
        TEST_ORGANIZATION_ID
      )
    ).toBeNull();
  });

  it("cannot write the Graph: an Entity create fails and leaves nothing", async () => {
    const cased = await seedCase(db);

    const result = await asWorker(
      Effect.result(
        createEntityEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          kind: "person",
          name: "Ada Lovelace",
          slug: "ada-lovelace",
        })
      )
    );

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({ _tag: "InternalError" });
    }
    expect(await entitiesRepo.listForCase(db, cased.id)).toEqual([]);
  });

  it("switches an application-role Db with inWorkerRole, for an API-key request", async () => {
    const cased = await seedCase(db);
    const create = createEntityEffect({
      caseId: cased.id,
      organizationId: TEST_ORGANIZATION_ID,
      kind: "person",
      name: "Grace Hopper",
      slug: "grace-hopper",
    });

    const refused = await asApp(Effect.result(inWorkerRole(create)));
    expect(Result.isFailure(refused)).toBe(true);

    const created = await asApp(create);
    expect(created.slug).toBe("grace-hopper");
  });
});
