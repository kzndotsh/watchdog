import { Effect, Layer, Predicate } from "effect";
import { PgBoss } from "pg-boss";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { db, jobsRepo } from "@watchdog/db";
import { env } from "@watchdog/env/server";
import { createLogger } from "@watchdog/log";
import { REPORT_JSON_ARTIFACT } from "@watchdog/schemas/jobs";
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
import { JobFibers } from "../job-fibers.ts";
import { JobQueue, JobQueueWorker, jobQueueWorkerLayer } from "../job-queue.ts";
import { interruptOnQueueSignal } from "../queue-signal.ts";
import { executeJobOnMap } from "../run-job.ts";

const HANG_HOST = "hang.wd397.test";
const OK_HOST = "ok.wd397.test";

vi.mock("@watchdog/log", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@watchdog/log")>();
  return { ...actual, createLogger: vi.fn(actual.createLogger) };
});

// The DNS Cap, with its network call swapped: one host never answers, the other
// answers at once. Everything else (preflight, status writes, finish) is real.
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
          Predicate.hasProperty(ctx.input, "host") &&
          ctx.input.host === HANG_HOST
            ? Effect.never
            : ctx
                .uploadArtifact({
                  bytes: new TextEncoder().encode("{}"),
                  mime: "application/json",
                  name: REPORT_JSON_ARTIFACT,
                })
                .pipe(Effect.map((artifact) => ({ artifacts: [artifact] }))),
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

const WORK = { localConcurrency: 1, pollingIntervalSeconds: 0.5 } as const;

async function terminalJob(jobId: string) {
  return vi.waitFor(
    async () => {
      const row = await jobsRepo.get(db, jobId);
      if (!row || row.status === "queued" || row.status === "running") {
        throw new Error(`Job ${jobId} has not finished`);
      }
      return row;
    },
    { timeout: 20_000, interval: 100 }
  );
}

describe("pg-boss job.signal reaches the Job fiber (#397)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
    await resetActorAccess(db, { userId: TEST_ACTOR_ID, keyId: "wd397-key" });
    vi.mocked(createLogger).mockClear();
  });

  it("interrupts an expired Job, frees the slot for the next Job and leaves a normal Job alone", async () => {
    const cased = await seedCase(db);
    const hung = await seedJob(db, cased.id, { input: { host: HANG_HOST } });
    const normal = await seedJob(db, cased.id, { input: { host: OK_HOST } });

    await Effect.gen(function* signalGen() {
      const worker = yield* JobQueueWorker;
      const queue = yield* JobQueue;
      const context = yield* Effect.context<
        Db | JobFibers | JobQueue | Layer.Success<typeof services>
      >();
      const runBatch = Effect.runPromiseWith(context);
      yield* worker.work(WORK, (jobs) =>
        runBatch(
          Effect.forEach(
            jobs,
            (job) => {
              const jobId = (job.data as { jobId: string }).jobId;
              return interruptOnQueueSignal(job, jobId, executeJobOnMap(jobId));
            },
            { discard: true }
          )
        )
      );
      // The hung Job is delivered first and holds the only slot (concurrency 1).
      yield* queue.send(
        { jobId: hung.id },
        { expireInSeconds: 1, singletonKey: hung.id }
      );
      yield* queue.send(
        { jobId: normal.id },
        { expireInSeconds: 60, singletonKey: normal.id }
      );
      yield* Effect.promise(async () => {
        const interrupted = await terminalJob(hung.id);
        expect(interrupted.status).toBe("failed");
        expect(interrupted.error).toBe("Timed out after 1s");
        expect(interrupted.finishedAt).not.toBeNull();

        const next = await terminalJob(normal.id);
        expect(next.status).toBe("succeeded");
        expect(next.error).toBeNull();
        // It could only start once the expired Job's slot was free.
        expect(next.startedAt?.getTime()).toBeGreaterThanOrEqual(
          interrupted.finishedAt?.getTime() ?? Number.POSITIVE_INFINITY
        );
      });
    }).pipe(Effect.provide(live), Effect.scoped, Effect.runPromise);
  }, 60_000);

  it("persists pg-boss warnings and logs them at warn level", async () => {
    const jobId = crypto.randomUUID();
    const startedAt = new Date();
    const reader = new PgBoss({
      connectionString: env.DATABASE_URL,
      application_name: "wd397-reader",
      supervise: false,
      schedule: false,
      migrate: false,
    });
    reader.on("error", () => {});
    await reader.start();
    try {
      await Effect.gen(function* warningGen() {
        const worker = yield* JobQueueWorker;
        const queue = yield* JobQueue;
        // A handler that ignores `job.signal`: pg-boss fails the delivery at
        // its expiry and warns that the handler still holds the worker. The
        // handler returns once the test has seen the warning.
        let release = () => {};
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        yield* worker.work(WORK, () => gate);
        yield* queue.send(
          { jobId },
          { expireInSeconds: 1, singletonKey: jobId }
        );
        yield* Effect.promise(async () => {
          try {
            const row = await vi.waitFor(
              async () => {
                const { rows } = await reader
                  .getDb()
                  .executeSql(
                    "SELECT type, message FROM pgboss.warning WHERE type = 'handler_overrun' AND created_on >= $1 ORDER BY created_on DESC LIMIT 1",
                    [startedAt]
                  );
                const [first] = rows as { type: string; message: string }[];
                if (first === undefined)
                  throw new Error("no overrun warning yet");
                return first;
              },
              { timeout: 20_000, interval: 100 }
            );
            expect(row.type).toBe("handler_overrun");
            expect(row.message).toContain("still running after exceeding 1s");
            expect(vi.mocked(createLogger)).toHaveBeenCalledWith(
              expect.objectContaining({
                scope: "pg-boss:worker",
                data: expect.objectContaining({ type: "handler_overrun" }),
              })
            );
          } finally {
            release();
          }
        });
      }).pipe(Effect.provide(live), Effect.scoped, Effect.runPromise);
    } finally {
      await reader.stop({ graceful: false, close: true });
    }
  }, 60_000);
});
