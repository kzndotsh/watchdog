import { Effect, Layer } from "effect";
import { beforeEach, describe, expect, it } from "vitest";

import { recordingBlobStore } from "@watchdog/core/blob";
import { ConflictError, InternalError } from "@watchdog/core/errors";
import { Db, transact } from "@watchdog/core/infra";
import {
  enqueueCapJobEffect,
  jobQueueProducerLayer,
  makeJobQueueLayers,
  processEvidenceEffect,
  recordingJobQueue,
  type BossDriver,
  type JobQueue,
  runPlaybookEffect,
  startJobEffect,
} from "@watchdog/core/jobs";
import { vaultLayer } from "@watchdog/core/vault";
import { db } from "@watchdog/db";
import { EGRESS_CLASSES } from "@watchdog/schemas/shared";
import { TEST_ORGANIZATION_ID } from "@watchdog/schemas/testing";
import {
  countJobDeliveries,
  listCaseJobs,
  resetTestDb,
  seedCase,
  seedEvidence,
  seedJob,
  seedOrganizationMember,
} from "@watchdog/test-db";
import { TEST_ACTOR_ID } from "@watchdog/test-kit";

import { startCaseExportJobEffect } from "../export-job";
import { CASE_EXPORT_JOB } from "../system-jobs";

// The real producer: pg-boss inserts each delivery on the producing transaction (#721).
const live = Layer.mergeAll(
  Layer.provideMerge(vaultLayer, Db.layer),
  recordingBlobStore().layer,
  jobQueueProducerLayer
);

function run<A, E>(
  effect: Effect.Effect<A, E, Layer.Success<typeof live>>
): Promise<A> {
  return Effect.runPromise(effect.pipe(Effect.provide(live)));
}

describe("a Job is queued in the transaction that saves it (#721)", () => {
  beforeEach(async () => {
    await resetTestDb();
    await seedOrganizationMember(db, {
      organizationId: TEST_ORGANIZATION_ID,
      userId: TEST_ACTOR_ID,
      role: "member",
    });
  });

  it("a rolled-back producing transaction leaves no delivery; a committed one leaves exactly one", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const rolledBack = await seedJob(db, cased.id);
    const committed = await seedJob(db, cased.id);

    const failure = await run(
      Effect.flip(
        transact((tx) =>
          enqueueCapJobEffect(tx, rolledBack.id, rolledBack.capabilityId).pipe(
            Effect.andThen(
              Effect.fail(new ConflictError({ reason: "roll back" }))
            )
          )
        )
      )
    );
    expect(failure).toBeInstanceOf(ConflictError);
    expect(await countJobDeliveries(db, rolledBack.id)).toBe(0);

    await run(
      transact((tx) =>
        enqueueCapJobEffect(tx, committed.id, committed.capabilityId)
      )
    );
    expect(await countJobDeliveries(db, committed.id)).toBe(1);
  });

  it("starting a Job leaves exactly one delivery", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const job = await run(
      startJobEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        capabilityId: "network.dns.lookup",
        actorId: TEST_ACTOR_ID,
        input: { host: "mailhost.test" },
      })
    );
    expect(await countJobDeliveries(db, job.id)).toBe(1);
  });

  it("running a Playbook leaves exactly one delivery for its first step", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const started = await run(
      runPlaybookEffect({
        caseId: cased.id,
        organizationId: TEST_ORGANIZATION_ID,
        playbookId: "host-footprint",
        actorId: TEST_ACTOR_ID,
        seed: { host: "mailhost.test" },
      })
    );
    const [step] = started.jobs;
    expect(step).toBeDefined();
    expect(await countJobDeliveries(db, step?.id ?? "")).toBe(1);
  });

  it("an Evidence verb and a Case export each leave one delivery, and joining an open Job adds none", async () => {
    const cased = await seedCase(db, { allowedEgress: [...EGRESS_CLASSES] });
    const evidence = await seedEvidence(db, cased.id, { kind: "file" });
    const processEvidence = () =>
      run(
        processEvidenceEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          evidenceId: evidence.id,
          actorId: TEST_ACTOR_ID,
        })
      );
    const processed = await processEvidence();
    const joined = await processEvidence();
    expect(joined.id).toBe(processed.id);
    expect(await countJobDeliveries(db, processed.id)).toBe(1);

    const exportCase = () =>
      run(
        startCaseExportJobEffect({
          caseId: cased.id,
          organizationId: TEST_ORGANIZATION_ID,
          actorId: TEST_ACTOR_ID,
        })
      );
    const exported = await exportCase();
    await exportCase();
    expect(await countJobDeliveries(db, exported.jobId)).toBe(1);
    expect(await listCaseJobs(db, cased.id)).toHaveLength(2);
  });
});

describe("enqueueCapJobEffect", () => {
  const JOB_ID = "11111111-1111-4111-8111-000000000001";

  function enqueueWith(
    queueLayer: Layer.Layer<JobQueue>,
    jobId: string,
    capabilityId: string
  ) {
    return Effect.runPromise(
      transact((tx) => enqueueCapJobEffect(tx, jobId, capabilityId)).pipe(
        Effect.provide(Layer.mergeAll(Db.layer, queueLayer))
      )
    );
  }

  it("sends the trimmed job id with the Cap-derived expire and singleton key", async () => {
    const recording = recordingJobQueue();
    await enqueueWith(recording.layer, `  ${JOB_ID}  `, "network.dns.lookup");
    expect(recording.sends).toHaveLength(1);
    expect(recording.sends[0]?.payload).toEqual({ jobId: JOB_ID });
    expect(recording.sends[0]?.options.singletonKey).toBe(JOB_ID);
    expect(recording.sends[0]?.options.expireInSeconds).toBeGreaterThan(60);
  });

  it("enqueues a Job to the lane of its capability", async () => {
    const recording = recordingJobQueue();
    for (const capabilityId of [
      "network.dns.lookup",
      "archive.url.submit",
      CASE_EXPORT_JOB,
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- the lanes are compared in send order
      await enqueueWith(recording.layer, JOB_ID, capabilityId);
    }
    expect(recording.sends.map((send) => send.options.lane)).toEqual([
      "quick",
      "act",
      "heavy",
    ]);
  });

  it("rejects a blank job id without reaching the queue", async () => {
    const recording = recordingJobQueue();
    await expect(
      enqueueWith(recording.layer, "   ", "network.dns.lookup")
    ).rejects.toMatchObject({ _tag: "InvalidError" });
    expect(recording.sends).toHaveLength(0);
  });

  it("fails with InternalError, keeping driver text out of the reason, when the queue driver fails", async () => {
    const driverText = "connect ECONNREFUSED 10.0.0.7:5432 (user=boss)";
    const driver: BossDriver = {
      start: () => Promise.reject(new Error(driverText)),
      stop: async () => {},
      ensureQueue: async () => {},
      send: async () => {},
      work: async () => {},
    };
    const failure = await enqueueWith(
      makeJobQueueLayers(() => driver).producerLayer,
      JOB_ID,
      "network.dns.lookup"
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(InternalError);
    expect(failure).toMatchObject({
      reason: "pg-boss failed",
      cause: expect.objectContaining({ message: driverText }),
    });
  });
});
