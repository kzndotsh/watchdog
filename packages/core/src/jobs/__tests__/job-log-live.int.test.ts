import { Effect, Fiber, Layer } from "effect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { replayActivityEffect } from "@watchdog/core/activity";
import { runDomain } from "@watchdog/core/infra";
import { db, jobsRepo } from "@watchdog/db";
import {
  TEST_ORGANIZATION_ID,
  TEST_OTHER_ORGANIZATION_ID,
} from "@watchdog/schemas/testing";
import {
  listAllActivity,
  resetActorAccess,
  resetTestDb,
  seedCase,
  seedJob,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";
import { ValidationVendorError } from "@watchdog/tools/errors";
import { outboundClientLayer } from "@watchdog/tools/http";

import { recordingBlobStore } from "../../infra/blob-store.ts";
import { Db } from "../../infra/db-service.ts";
import { vaultLayer } from "../../infra/vault.ts";
import { cancelJobEffect } from "../cancel-jobs.ts";
import { JobFibers } from "../job-fibers.ts";
import {
  flushJobLogEffect,
  createJobLog,
  jobLogTruncationMarker,
  jobLogSettings,
} from "../job-log.ts";
import { recordingJobQueue } from "../job-queue.ts";
import { executeJobOnMap } from "../run-job.ts";

const LIVE_HOST = "live.wd479.test";
const CANCEL_HOST = "cancel.wd479.test";
const DIE_HOST = "die.wd479.test";
const CHATTY_HOST = "chatty.wd479.test";
const CHATTY_LINES = 5000;

/** The live Cap holds its body here until the test has seen its first line stored. */
const gate = vi.hoisted(() => ({
  release: () => {},
  wait: Promise.resolve(),
  started: () => {},
}));

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
          const host = (ctx.input as { host: string }).host;
          if (host === LIVE_HOST) {
            ctx.log("live: first line");
            gate.started();
            return Effect.promise(() => gate.wait).pipe(
              Effect.tap(() => Effect.sync(() => ctx.log("live: last line"))),
              Effect.as({ artifacts: [] })
            );
          }
          if (host === CANCEL_HOST) {
            ctx.log("cancel: before cancel");
            gate.started();
            return Effect.never;
          }
          if (host === DIE_HOST) {
            ctx.log("die: before failure");
            return Effect.fail(new ValidationVendorError({ message: "boom" }));
          }
          for (let i = 0; i < CHATTY_LINES; i += 1) ctx.log(`chatty ${i}`);
          return Effect.succeed({ artifacts: [] });
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

function untilStarted(): Promise<void> {
  return new Promise<void>((resolve) => {
    gate.started = resolve;
  });
}

/** Poll the stored row until `done` holds (the flusher writes on its own timer). */
async function untilRow(
  jobId: string,
  done: (row: NonNullable<Awaited<ReturnType<typeof jobsRepo.get>>>) => boolean
) {
  return vi.waitFor(
    async () => {
      const row = await jobsRepo.get(db, jobId);
      if (!row || !done(row)) throw new Error("log never reached the row");
      return row;
    },
    { timeout: 8000, interval: 50 }
  );
}

async function seedLogJob(host: string) {
  const cased = await seedCase(db);
  const job = await seedJob(db, cased.id, {
    capabilityId: "network.dns.lookup",
    input: { host },
  });
  return { cased, job };
}

async function loggedEntries(jobId: string) {
  const rows = await listAllActivity(db);
  return rows.filter(
    (row) =>
      row.kind === "job" && row.action === "logged" && row.subjectId === jobId
  );
}

describe("Job log lines are saved while the Job runs", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd479-key" });
    queue.sends.length = 0;
    gate.started = () => {};
    gate.wait = new Promise<void>((resolve) => {
      gate.release = resolve;
    });
  });
  afterEach(() => {
    gate.release();
    vi.restoreAllMocks();
  });

  it("stores a line and announces it before the Job settles", async () => {
    const { job } = await seedLogJob(LIVE_HOST);
    const started = untilStarted();

    await program(
      Effect.gen(function* liveGen() {
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => started);
        const midRun = yield* Effect.promise(() =>
          untilRow(job.id, (row) => row.logs.includes("live: first line"))
        );
        // The Job is still running: the line was saved, not settled with the Job.
        expect(midRun.status).toBe("running");
        expect(midRun.logs).not.toContain("live: last line");
        const announced = yield* Effect.promise(() => loggedEntries(job.id));
        expect(announced).not.toHaveLength(0);
        gate.release();
        yield* Fiber.join(running);
      })
    );

    const done = await jobsRepo.get(db, job.id);
    expect(done?.status).toBe("succeeded");
    expect(done?.logs).toContain("live: first line");
    expect(done?.logs).toContain("live: last line");
  });

  it("saves the lines logged since the last save when a person cancels the Job", async () => {
    const { cased, job } = await seedLogJob(CANCEL_HOST);
    const started = untilStarted();

    await program(
      Effect.gen(function* cancelGen() {
        const fibers = yield* JobFibers;
        const running = yield* Effect.forkChild(executeJobOnMap(job.id));
        yield* Effect.promise(() => started);
        // Before the first timed save: only the final save can store the line.
        yield* cancelJobEffect(cased.id, TEST_ORGANIZATION_ID, job.id).pipe(
          Effect.orDie
        );
        yield* fibers.abort(job.id, { cause: "user_cancelled" });
        yield* Fiber.join(running);
      })
    );

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("cancelled");
    expect(row?.logs).toContain("cancel: before cancel");
  });

  it("saves the lines logged before a Cap failure", async () => {
    const { job } = await seedLogJob(DIE_HOST);

    await program(executeJobOnMap(job.id));

    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("failed");
    expect(row?.logs).toContain("die: before failure");
    expect(row?.logs.some((line) => line.startsWith("run failed:"))).toBe(true);
    // The final save announced the lines too.
    expect(await loggedEntries(job.id)).not.toHaveLength(0);
  });

  it("bounds a chatty Cap's log and ends it with the truncation marker", async () => {
    const { job } = await seedLogJob(CHATTY_HOST);

    await program(executeJobOnMap(job.id));

    const settings = jobLogSettings();
    const row = await jobsRepo.get(db, job.id);
    expect(row?.status).toBe("succeeded");
    expect(row?.logs.length).toBeLessThanOrEqual(settings.maxLines + 3);
    expect(row?.logs).toContain(jobLogTruncationMarker(settings));
    expect(row?.logs).not.toContain(`chatty ${CHATTY_LINES - 1}`);
    // A chatty Cap saves in batches, never a row per line.
    expect((await loggedEntries(job.id)).length).toBeLessThan(10);
  });
});

describe("live Job log events are scoped to the organization", () => {
  beforeEach(async () => {
    await resetTestDb();
  });

  it("replays a `logged` entry only to the organization that owns the Case", async () => {
    const own = await seedCase(db, { organizationId: TEST_ORGANIZATION_ID });
    const foreign = await seedCase(db, {
      name: "Foreign",
      slug: "foreign",
      organizationId: TEST_OTHER_ORGANIZATION_ID,
    });
    const ownJob = await seedJob(db, own.id, {
      capabilityId: "network.dns.lookup",
    });
    const foreignJob = await seedJob(db, foreign.id, {
      capabilityId: "network.dns.lookup",
    });
    for (const job of [ownJob, foreignJob]) {
      const log = createJobLog();
      log.log("secret-looking progress");
      // oxlint-disable-next-line eslint/no-await-in-loop -- entries append in order
      await runDomain(flushJobLogEffect(job, log));
    }

    const replay = await runDomain(
      replayActivityEffect({
        organizationId: TEST_ORGANIZATION_ID,
        after: { xid: "0", id: 0 },
      })
    );
    const logged =
      replay.kind === "entries"
        ? replay.entries.filter((entry) => entry.action === "logged")
        : [];
    expect(logged.map((entry) => entry.subjectId)).toEqual([ownJob.id]);
    // The entry carries a count, never a line.
    expect(JSON.stringify(logged)).not.toContain("secret-looking");
  });
});
