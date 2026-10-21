import {
  Cause,
  Context,
  Effect,
  Exit,
  Fiber,
  Layer,
  Predicate,
  Scope,
} from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { db, jobsRepo, playbookRunsRepo } from "@watchdog/db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { deleteCaseEffect } from "../../../cases/tombstone.ts";
import { recordingBlobStore } from "../../../infra/blob-store.ts";
import { Db } from "../../../infra/db-service.ts";
import { transact } from "../../../infra/postgres-tx.ts";
import { InternalError } from "../../../infra/tagged-errors.ts";
import { vaultLayer } from "../../../infra/vault.ts";
import { cancelJobEffect } from "../../cancel-jobs.ts";
import { JobFibers } from "../../job-fibers.ts";
import { recordingJobQueue } from "../../job-queue.ts";
import { executeJobOnMap } from "../../run-job.ts";
import { cancelWithin } from "../cancel.ts";
import { stop } from "../stop.ts";

const HANG_HOST = "hang.wd434.test";

/** Called when the DNS Cap's body starts, so a test knows the attempt is in `use`. */
const capStart = vi.hoisted(() => ({ notify: () => {} }));

// The DNS Cap with its network call swapped: one host never answers. Preflight, status writes
// and finish are real.
vi.mock("@watchdog/caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...actual,
    requireCapability: (id: string) => {
      const cap = actual.requireCapability(id);
      if (id !== "network.dns.lookup") return cap;
      return {
        ...cap,
        run: (ctx: Parameters<typeof cap.run>[0]) => {
          capStart.notify();
          return Predicate.hasProperty(ctx.input, "host") &&
            ctx.input.host === HANG_HOST
            ? Effect.never
            : ctx
                .uploadArtifact({
                  bytes: new TextEncoder().encode("{}"),
                  mime: "application/json",
                  name: REPORT_JSON_ARTIFACT,
                })
                .pipe(Effect.map((artifact) => ({ artifacts: [artifact] })));
        },
      };
    },
  };
});

const queue = recordingJobQueue();
const baseServices = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  recordingBlobStore().layer,
  outboundClientLayer,
  queue.layer
);
const services = Layer.mergeAll(baseServices, JobFibers.layer);

function program<A>(
  effect: Effect.Effect<A, never, Layer.Success<typeof services>>
) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(services), Effect.scoped)
  );
}

function untilCapStarts(): Promise<void> {
  return new Promise<void>((resolve) => {
    capStart.notify = resolve;
  });
}

/** Count of Playbook advances: each one locks the run's row once. */
function spyOnAdvances() {
  return vi.spyOn(playbookRunsRepo, "lock");
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

async function terminalEntries(jobId: string) {
  const rows = await listAllActivity(db);
  return rows.filter(
    (row) =>
      row.kind === "job" &&
      row.subjectId === jobId &&
      TERMINAL.has(row.toValue ?? "")
  );
}

/** A Job of a Playbook run, queued or running. */
async function seedStepJob(status: "queued" | "running", host = HANG_HOST) {
  const cased = await seedCase(db);
  const run = await seedPlaybookRun(db, cased.id, {
    playbookId: "host-footprint",
    seed: { host },
  });
  const job = await seedJob(db, cased.id, {
    capabilityId: "network.dns.lookup",
    input: { host },
    playbookRunId: run.id,
    playbookStep: 0,
    status,
  });
  return { cased, run, job };
}

beforeEach(async () => {
  await resetTestDb();
  await seedOrganizationMember(db, {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_ACTOR_ID,
    role: "owner",
  });
  await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd434-key" });
  queue.sends.length = 0;
  capStart.notify = () => {};
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cancel: a person or a Case delete ends open Jobs", () => {
  it("a user cancel records user_cancelled, one entry, and advances the Playbook", async () => {
    const { cased, run, job } = await seedStepJob("queued");
    const advances = spyOnAdvances();

    await program(
      cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id).pipe(Effect.orDie)
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.errorCode).toBe("user_cancelled");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
    expect((await playbookRunsRepo.get(db, run.id))?.status).not.toBe(
      "running"
    );
  });

  it("a Case delete records case_deleted on every open Job and advances their runs", async () => {
    const first = await seedStepJob("queued");
    const second = await seedJob(db, first.cased.id, { status: "running" });
    const done = await seedJob(db, first.cased.id, { status: "succeeded" });
    const advances = spyOnAdvances();

    await program(
      deleteCaseEffect(first.cased.id, {
        organizationId: TEST_ORGANIZATION_ID,
        actorId: TEST_ACTOR_ID,
      }).pipe(Effect.orDie)
    );

    expect((await jobsRepo.get(db, first.job.id))?.errorCode).toBe(
      "case_deleted"
    );
    expect((await jobsRepo.get(db, second.id))?.errorCode).toBe("case_deleted");
    const finished = await jobsRepo.get(db, done.id);
    expect(finished?.status).toBe("succeeded");
    expect(finished?.errorCode).toBeNull();
    expect(await terminalEntries(first.job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
  });

  it("a cancel of an already finished Job does nothing: no entry, no advance, no abort", async () => {
    const { cased, run } = await seedStepJob("queued");
    const done = await seedJob(db, cased.id, {
      status: "succeeded",
      playbookRunId: run.id,
      playbookStep: 1,
    });
    const advances = spyOnAdvances();
    const entriesBefore = await terminalEntries(done.id);

    const outcome = await program(
      transact((tx) =>
        cancelWithin(
          tx,
          { kind: "job", caseId: cased.id, jobId: done.id },
          "user_cancelled"
        )
      ).pipe(
        Effect.tap((result) => result.afterCommit),
        Effect.orDie
      )
    );

    expect(outcome.cancelled).toEqual([]);
    expect((await jobsRepo.get(db, done.id))?.status).toBe("succeeded");
    expect(await terminalEntries(done.id)).toEqual(entriesBefore);
    expect(advances).not.toHaveBeenCalled();
  });

  it("a cancel in a transaction that rolls back changes nothing and aborts nothing", async () => {
    const { cased, job } = await seedStepJob("queued");
    const advances = spyOnAdvances();
    const capStarted = untilCapStarts();

    await program(
      Effect.gen(function* rollbackGen() {
        const fibers = yield* JobFibers;
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => capStarted);
        const attempt = yield* Effect.exit(
          transact((tx) =>
            Effect.gen(function* cancelThenFail() {
              yield* cancelWithin(
                tx,
                { kind: "case", caseId: cased.id },
                "case_deleted"
              );
              return yield* new InternalError({ reason: "roll it back" });
            })
          )
        );
        expect(Exit.isFailure(attempt)).toBe(true);
        // Nothing was aborted: the fiber still runs and the Job is still running.
        expect(fibers.listIds()).toEqual([job.id]);
        expect(running.pollUnsafe()).toBeUndefined();
        expect(
          (yield* Effect.promise(() => jobsRepo.get(db, job.id)))?.status
        ).toBe("running");
        yield* stop({ kind: "running" }, "worker_shutdown");
        yield* Fiber.join(running);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    // The only terminal write is the shutdown stop that ended the test, not the rolled-back cancel.
    expect(row?.errorCode).toBe("worker_shutdown");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
  });

  it("a Job cancelled elsewhere and then aborted here settles and advances nothing a second time", async () => {
    const { cased, job } = await seedStepJob("queued");
    const capStarted = untilCapStarts();
    const advances = spyOnAdvances();

    await program(
      Effect.gen(function* cancelPollGen() {
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => capStarted);
        // Another process cancelled the Job and has run its own follow-up: here only the row
        // changed, as the cancel poll sees it.
        yield* transact((tx) =>
          cancelWithin(
            tx,
            { kind: "job", caseId: cased.id, jobId: job.id },
            "user_cancelled"
          )
        ).pipe(Effect.orDie);
        yield* stop({ kind: "job", jobId: job.id }, "user_cancelled");
        yield* Fiber.join(running);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.errorCode).toBe("user_cancelled");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    // The release found the Job already terminal and left the advance to the canceller.
    expect(advances).not.toHaveBeenCalled();
  });
});

describe("stop: sources without a transaction", () => {
  it.each([
    ["queue_aborted", undefined],
    ["cap_timeout", "Timed out after 5s"],
    ["worker_shutdown", undefined],
  ] as const)(
    "%s ends the running Job failed with its own code",
    async (cause, detail) => {
      const { job } = await seedStepJob("queued");
      const capStarted = untilCapStarts();

      await program(
        Effect.gen(function* stopGen() {
          const running = yield* Effect.forkChild(executeJobOnMap(job.id));
          yield* Effect.promise(() => capStarted);
          const stopped = yield* stop(
            { kind: "job", jobId: job.id },
            cause,
            detail
          );
          expect(stopped).toBe(1);
          yield* Fiber.join(running);
        })
      );

      const row = await jobsRepo.get(db, job.id);
      expect(row?.status).toBe("failed");
      expect(row?.errorCode).toBe(cause);
      expect(await terminalEntries(job.id)).toHaveLength(1);
    }
  );

  it("stops nothing for a Job no fiber here runs", async () => {
    const { job } = await seedStepJob("queued");
    const stopped = await program(
      stop({ kind: "job", jobId: job.id }, "worker_shutdown")
    );
    expect(stopped).toBe(0);
    expect((await jobsRepo.get(db, job.id))?.status).toBe("queued");
  });

  it("graceful shutdown ends the running Job failed with worker_shutdown and advances the run", async () => {
    const { job, run } = await seedStepJob("queued");
    const advances = spyOnAdvances();
    const capStarted = untilCapStarts();

    // JobFibers has a scope of its own, closed as the worker closes it: after the queue has
    // drained, before the database goes.
    const fibersScope = await Effect.runPromise(Scope.make());
    const fibersContext = await Effect.runPromise(
      Layer.buildWithScope(JobFibers.layer, fibersScope)
    );
    const fibers = Context.get(fibersContext, JobFibers);
    const running = Effect.runFork(
      executeJobOnMap(job.id).pipe(
        Effect.provide(baseServices),
        Effect.provideContext(fibersContext),
        Effect.scoped
      )
    );
    await capStarted;
    expect(fibers.listIds()).toEqual([job.id]);

    await Effect.runPromise(Scope.close(fibersScope, Exit.void));
    const exit = await Effect.runPromise(Fiber.await(running));

    expect(Exit.isSuccess(exit) || Cause.hasInterruptsOnly(exit.cause)).toBe(
      true
    );
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("worker_shutdown");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
    expect((await playbookRunsRepo.get(db, run.id))?.status).not.toBe(
      "running"
    );
  });
});
