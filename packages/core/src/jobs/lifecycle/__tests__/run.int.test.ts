import { Effect, Fiber, Layer, Predicate } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  capCacheRepo,
  casesRepo,
  db,
  evidenceRepo,
  jobsRepo,
  playbookRunsRepo,
} from "@watchdog/db";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
  seedOrganizationMember,
  seedPlaybookRun,
  seedProposal,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { outboundClientLayer } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../../infra/blob-store.ts";
import { Db } from "../../../infra/db-service.ts";
import { vaultLayer } from "../../../infra/vault.ts";
import { cancelJobEffect } from "../../cancel-jobs.ts";
import { hashCapInput } from "../../cap-cache.ts";
import { JobFibers, type JobFibersApi } from "../../job-fibers.ts";
import { recordingJobQueue } from "../../job-queue.ts";
import { executeJobEffect, executeJobOnMap } from "../../run-job.ts";
import type { JobStop } from "../stop-slot.ts";

const HANG_HOST = "hang.wd433.test";
const OK_HOST = "ok.wd433.test";
/** The Cap whose timer the timeout test lets fire: a short timeout and a body that never ends. */
const SLOW_CAP = "network.whois.lookup";
const SLOW_CAP_TIMEOUT_MS = 200;

/** Called when the DNS Cap's body starts, so a test knows the attempt is in `use`. */
const capStart = vi.hoisted(() => ({ notify: () => {} }));

// The DNS Cap with its network call swapped (one host never answers, the other answers at
// once) and a Cap with a short timer that never answers; preflight, status writes and finish
// are real.
vi.mock("@watchdog/caps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/caps")>();
  return {
    ...actual,
    requireCapability: (id: string) => {
      const cap = actual.requireCapability(id);
      if (id === SLOW_CAP) {
        return {
          ...cap,
          timeoutMs: SLOW_CAP_TIMEOUT_MS,
          run: () => Effect.never,
        };
      }
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
const services = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  recordingBlobStore().layer,
  outboundClientLayer,
  queue.layer,
  JobFibers.layer
);

function program<A>(
  effect: Effect.Effect<A, never, Layer.Success<typeof services>>
) {
  return Effect.runPromise(
    effect.pipe(Effect.provide(services), Effect.scoped)
  );
}

/** Resolves when the DNS Cap's body starts. */
function untilCapStarts(): Promise<void> {
  return new Promise<void>((resolve) => {
    capStart.notify = resolve;
  });
}

/**
 * Start an abort from inside a repo call the attempt is waiting on. The abort offers its stop
 * and marks the interrupt synchronously; it cannot be awaited there, because it waits for the
 * fiber to end and the fiber is inside the call.
 */
function abortFromInside(
  fibers: JobFibersApi,
  jobId: string,
  stop: JobStop
): void {
  Effect.runFork(fibers.abort(jobId, stop));
}

/** Count of Playbook advances: each one locks the run's row once. */
function spyOnAdvances() {
  return vi.spyOn(playbookRunsRepo, "lock");
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** The entries the Job's status moves wrote: one per transition, so one terminal entry. */
async function terminalEntries(jobId: string) {
  const rows = await listAllActivity(db);
  return rows.filter(
    (row) =>
      row.kind === "job" &&
      row.subjectId === jobId &&
      TERMINAL.has(row.toValue ?? "")
  );
}

async function seedRunJob(host: string, capabilityId = "network.dns.lookup") {
  const cased = await seedCase(db);
  const run = await seedPlaybookRun(db, cased.id, {
    playbookId: "host-footprint",
    seed: { host },
  });
  const job = await seedJob(db, cased.id, {
    capabilityId,
    input: { host },
    playbookRunId: run.id,
    playbookStep: 0,
  });
  return { cased, run, job };
}

async function resetWorld() {
  await resetTestDb();
  await seedOrganizationMember(db, {
    organizationId: TEST_ORGANIZATION_ID,
    userId: TEST_ACTOR_ID,
    role: "member",
  });
  await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd433-key" });
  queue.sends.length = 0;
  capStart.notify = () => {};
}

describe("lifecycle run: every way out settles once", () => {
  beforeEach(resetWorld);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("an interrupt during the Cap body ends the Job failed, once, and advances the run", async () => {
    const { run, job } = await seedRunJob(HANG_HOST);
    const advances = spyOnAdvances();
    const capStarted = untilCapStarts();

    const outcome = await program(
      Effect.gen(function* duringBodyGen() {
        const fibers = yield* JobFibers;
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => capStarted);
        yield* fibers.abort(job.id, { cause: "queue_aborted" });
        return yield* Fiber.join(running);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("queue_aborted");
    expect(row?.error).toBe("aborted");
    expect(outcome).toMatchObject({
      outcome: "failed",
      stopCause: "queue_aborted",
    });
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
    // The next step is independent of the failed one: the run advanced to it.
    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    expect(members.find((j) => j.playbookStep === 1)?.status).toBe("queued");
  });

  it("an interrupt during preflight ends the Job failed, once, without running the Cap", async () => {
    const { job } = await seedRunJob(OK_HOST);
    const advances = spyOnAdvances();
    let capRan = false;
    capStart.notify = () => {
      capRan = true;
    };

    const outcome = await program(
      Effect.gen(function* duringPreflightGen() {
        const fibers = yield* JobFibers;
        // The Case read is the preflight's: the attempt is in acquire when the abort lands.
        const original = casesRepo.getByIdUnchecked.bind(casesRepo);
        vi.spyOn(casesRepo, "getByIdUnchecked").mockImplementationOnce(
          async (...args) => {
            abortFromInside(fibers, job.id, {
              cause: "cap_timeout",
              detail: "Timed out after 1s",
            });
            return original(...args);
          }
        );
        return yield* executeJobOnMap(job.id);
      })
    );

    expect(capRan).toBe(false);
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("cap_timeout");
    expect(row?.error).toBe("Timed out after 1s");
    expect(outcome.outcome).toBe("failed");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
  });

  it("an interrupt after the Cap body returned leaves the success: once, with the next step started", async () => {
    const { job } = await seedRunJob(OK_HOST);
    const advances = spyOnAdvances();

    const outcome = await program(
      Effect.gen(function* afterBodyGen() {
        const fibers = yield* JobFibers;
        // The body is done and release is writing the success when the abort lands.
        const original = jobsRepo.settle.bind(jobsRepo);
        vi.spyOn(jobsRepo, "settle").mockImplementation(async (...args) => {
          if (args[3].status === "succeeded") {
            abortFromInside(fibers, job.id, { cause: "queue_aborted" });
          }
          return original(...args);
        });
        return yield* executeJobOnMap(job.id);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("succeeded");
    expect(row?.errorCode).toBeNull();
    expect(outcome.outcome).toBe("succeeded");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
    expect(queue.sends).toHaveLength(1);
  });

  it("two stop sources racing record the first one's cause in error_code", async () => {
    const { job } = await seedRunJob(HANG_HOST);
    const capStarted = untilCapStarts();

    await program(
      Effect.gen(function* racingStopsGen() {
        const fibers = yield* JobFibers;
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => capStarted);
        yield* Effect.all(
          [
            fibers.abort(job.id, {
              cause: "cap_timeout",
              detail: "Timed out after 30s",
            }),
            fibers.abort(job.id, { cause: "queue_aborted" }),
            fibers.abort(job.id, { cause: "user_cancelled" }),
          ],
          { concurrency: "unbounded" }
        );
        yield* Fiber.join(running);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("cap_timeout");
    expect(row?.error).toBe("Timed out after 30s");
    expect(await terminalEntries(job.id)).toHaveLength(1);
  });

  it("an abort after a person cancelled the Job changes nothing and the run advances once, by the cancel", async () => {
    const { cased, job } = await seedRunJob(HANG_HOST);
    const advances = spyOnAdvances();
    const capStarted = untilCapStarts();

    await program(
      Effect.gen(function* cancelledGen() {
        const fibers = yield* JobFibers;
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => capStarted);
        yield* cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id).pipe(
          Effect.orDie
        );
        // What the cancel poll does once it has seen the cancelled row.
        yield* fibers.abort(job.id, { cause: "user_cancelled" });
        yield* Fiber.join(running);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    // The cancel wrote the row and its code; the stop that follows must not rewrite it.
    expect(row?.errorCode).toBe("user_cancelled");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
  });

  it("the Cap timer records cap_timeout in the stop slot and the Job fails", async () => {
    const { job } = await seedRunJob("example.com", SLOW_CAP);
    const advances = spyOnAdvances();

    const outcome = await program(executeJobOnMap(job.id));

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.errorCode).toBe("cap_timeout");
    expect(row?.error).toBe("Timed out after 1s");
    expect(outcome.stopCause).toBe("cap_timeout");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
  });
});

describe("lifecycle run: a reclaimed success is a success", () => {
  beforeEach(resetWorld);
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ARTIFACTS = [
    {
      name: REPORT_JSON_ARTIFACT,
      mime: "application/json",
      uri: "case/report.json",
      sha256: "ab".repeat(32),
    },
  ];

  it("advances the Playbook and stores the cache", async () => {
    const cased = await seedCase(db);
    const run = await seedPlaybookRun(db, cased.id, {
      playbookId: "handle-presence",
      seed: { handle: "octocat" },
    });
    const job = await seedJob(db, cased.id, {
      capabilityId: "identity.github.lookup",
      status: "running",
      input: { handle: "octocat" },
      playbookRunId: run.id,
      playbookStep: 0,
      output: ARTIFACTS,
    });
    const proposal = await seedProposal(db, cased.id, [], { jobId: job.id });
    await jobsRepo.update(db, job.id, {
      proposalId: proposal.id,
      resultSummary: "found octocat",
    });
    const advances = spyOnAdvances();

    const outcome = await program(executeJobEffect(job.id));

    expect(outcome).toMatchObject({
      outcome: "succeeded",
      stopReason: "reclaim_converged",
    });
    expect((await jobsRepo.get(db, job.id))?.status).toBe("succeeded");
    expect(await terminalEntries(job.id)).toHaveLength(1);
    expect(advances).toHaveBeenCalledTimes(1);
    const members = await jobsRepo.listForPlaybookRun(db, run.id);
    expect(members.filter((m) => m.playbookStep === 1)).toHaveLength(1);
    const cached = await capCacheRepo.lookupActive(
      db,
      cased.id,
      "identity.github.lookup",
      hashCapInput({ handle: "octocat" }),
      new Date()
    );
    expect(cached?.jobId).toBe(job.id);
  });

  it("stamps the source Evidence processed", async () => {
    const cased = await seedCase(db);
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const job = await seedJob(db, cased.id, {
      capabilityId: "evidence.harvest",
      status: "running",
      input: { evidenceId: evidence.id },
      output: ARTIFACTS,
    });
    const proposal = await seedProposal(db, cased.id, [], { jobId: job.id });
    await jobsRepo.update(db, job.id, { proposalId: proposal.id });

    await program(executeJobEffect(job.id));

    expect((await jobsRepo.get(db, job.id))?.status).toBe("succeeded");
    const rows = await evidenceRepo.listForCase(db, cased.id);
    expect(
      rows.find((row) => row.id === evidence.id)?.processedAt
    ).not.toBeNull();
  });
});
