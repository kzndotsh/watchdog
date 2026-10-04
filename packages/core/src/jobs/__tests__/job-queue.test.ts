import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Exit, Fiber, Layer, Option, Scope } from "effect";
import { vi } from "vitest";

import { InternalError } from "../../infra/tagged-errors";
import { enqueueCapJobEffect } from "../boss";
import {
  JobQueue,
  JobQueueWorker,
  makeJobQueueLayers,
  recordingJobQueue,
  type BossDriver,
} from "../job-queue";
import { gracefulStopTimeoutMs } from "../timeouts";

vi.mock("@watchdog/env/server", () => ({
  env: { DATABASE_URL: "postgresql://x:x@127.0.0.1:5432/x" },
}));

const JOB_ID = "11111111-1111-4111-8111-000000000001";
const DRIVER_TEXT = "connect ECONNREFUSED 10.0.0.7:5432 (user=boss)";

function fakeDriver() {
  const start = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  const ensureQueue = vi.fn(async () => {});
  const send = vi.fn(async () => {});
  const work = vi.fn(async () => {});
  const driver: BossDriver = { start, stop, ensureQueue, send, work };
  return { driver, start, stop, ensureQueue, send, work };
}

/** Build a Layer in an explicit scope so the test controls when it closes. */
function build<ROut, E>(layer: Layer.Layer<ROut, E>) {
  return Effect.gen(function* buildGen() {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(layer, scope);
    return {
      context,
      close: Scope.close(scope, Exit.succeed(undefined)),
    };
  });
}

describe("JobQueue producer Layer", () => {
  it.effect(
    "does not touch pg-boss until the first send, and never stops an unstarted boss",
    () =>
      Effect.gen(function* producerLazyGen() {
        const fake = fakeDriver();
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        expect(fake.start).not.toHaveBeenCalled();
        yield* built.close;
        expect(fake.stop).not.toHaveBeenCalled();
      })
  );

  it.effect("starts once, ensures the queue once, then sends", () =>
    Effect.gen(function* producerSendGen() {
      const fake = fakeDriver();
      const built = yield* build(
        makeJobQueueLayers(() => fake.driver).producerLayer
      );
      const queue = Context.get(built.context, JobQueue);
      const options = { expireInSeconds: 90, singletonKey: JOB_ID };
      yield* queue.send({ jobId: JOB_ID }, options);
      yield* queue.send({ jobId: JOB_ID }, options);
      expect(fake.start).toHaveBeenCalledTimes(1);
      expect(fake.ensureQueue).toHaveBeenCalledTimes(1);
      expect(fake.send).toHaveBeenCalledTimes(2);
      expect(fake.send).toHaveBeenCalledWith({ jobId: JOB_ID }, options);
      yield* built.close;
    })
  );

  it.effect(
    "retries a failed start on the next send instead of caching the failure",
    () =>
      Effect.gen(function* producerRetryGen() {
        const fake = fakeDriver();
        fake.start.mockRejectedValueOnce(new Error(DRIVER_TEXT));
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        const options = { expireInSeconds: 90, singletonKey: JOB_ID };
        const failure = yield* Effect.flip(
          queue.send({ jobId: JOB_ID }, options)
        );
        expect(failure).toBeInstanceOf(InternalError);
        yield* queue.send({ jobId: JOB_ID }, options);
        expect(fake.start).toHaveBeenCalledTimes(2);
        expect(fake.send).toHaveBeenCalledTimes(1);
        yield* built.close;
      })
  );

  it.effect(
    "stops once with the drain options on scope close, then refuses sends",
    () =>
      Effect.gen(function* producerReleaseGen() {
        const fake = fakeDriver();
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        const options = { expireInSeconds: 90, singletonKey: JOB_ID };
        yield* queue.send({ jobId: JOB_ID }, options);
        yield* built.close;

        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(fake.stop).toHaveBeenCalledWith({
          graceful: true,
          timeout: 5000,
        });

        const failure = yield* Effect.flip(
          queue.send({ jobId: JOB_ID }, options)
        );
        expect(failure).toBeInstanceOf(InternalError);
        expect(fake.send).toHaveBeenCalledTimes(1);
      })
  );

  it.effect(
    "does not provide the worker service: the roles are separate Layers",
    () =>
      Effect.gen(function* rolesSeparateGen() {
        const layers = makeJobQueueLayers(() => fakeDriver().driver);
        const producer = yield* build(layers.producerLayer);
        const worker = yield* build(layers.workerLayer);
        expect(
          Option.isNone(Context.getOption(producer.context, JobQueueWorker))
        ).toBe(true);
        expect(
          Option.isSome(Context.getOption(worker.context, JobQueueWorker))
        ).toBe(true);
        expect(Context.get(producer.context, JobQueue).role).toBe("producer");
        expect(Context.get(worker.context, JobQueue).role).toBe("worker");
        yield* producer.close;
        yield* worker.close;
      })
  );
});

describe("JobQueue producer Layer start races", () => {
  const options = { expireInSeconds: 90, singletonKey: JOB_ID };

  it.effect(
    "retries only ensureQueue after a failed ensure, and still stops the started boss",
    () =>
      Effect.gen(function* producerEnsureFailGen() {
        const fake = fakeDriver();
        fake.ensureQueue.mockRejectedValueOnce(new Error(DRIVER_TEXT));
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        const failure = yield* Effect.flip(
          queue.send({ jobId: JOB_ID }, options)
        );
        expect(failure).toBeInstanceOf(InternalError);
        yield* queue.send({ jobId: JOB_ID }, options);
        expect(fake.start).toHaveBeenCalledTimes(1);
        expect(fake.ensureQueue).toHaveBeenCalledTimes(2);
        yield* built.close;
        expect(fake.stop).toHaveBeenCalledTimes(1);
      })
  );

  it.effect(
    "stops a boss that was started but never ensured when the scope closes",
    () =>
      Effect.gen(function* producerStartedNotEnsuredGen() {
        const fake = fakeDriver();
        fake.ensureQueue.mockRejectedValueOnce(new Error(DRIVER_TEXT));
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        yield* Effect.flip(queue.send({ jobId: JOB_ID }, options));
        yield* built.close;
        expect(fake.stop).toHaveBeenCalledTimes(1);
      })
  );

  it.effect(
    "waits for an in-flight start on release, then stops the boss it started",
    () =>
      Effect.gen(function* producerReleaseDuringStartGen() {
        const fake = fakeDriver();
        const events: string[] = [];
        let finishStart: () => void = () => {};
        const pendingStart = new Promise<void>((resolve) => {
          finishStart = () => {
            events.push("start.done");
            resolve();
          };
        });
        fake.start.mockReturnValueOnce(pendingStart);
        fake.stop.mockImplementation(async () => {
          events.push("stop");
        });
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        const sending = yield* Effect.forkChild(
          Effect.result(queue.send({ jobId: JOB_ID }, options))
        );
        yield* Effect.yieldNow;
        const closing = yield* Effect.forkChild(built.close);
        yield* Effect.yieldNow;
        expect(fake.stop).not.toHaveBeenCalled();
        finishStart();
        yield* Fiber.await(sending);
        yield* Fiber.await(closing);
        expect(events).toEqual(["start.done", "stop"]);
        expect(fake.stop).toHaveBeenCalledTimes(1);
      })
  );

  it.effect("shares one start across an interrupted send and later sends", () =>
    Effect.gen(function* producerSharedStartGen() {
      const fake = fakeDriver();
      let finishStart: () => void = () => {};
      fake.start.mockReturnValueOnce(
        new Promise<void>((resolve) => {
          finishStart = resolve;
        })
      );
      const built = yield* build(
        makeJobQueueLayers(() => fake.driver).producerLayer
      );
      const queue = Context.get(built.context, JobQueue);
      const first = yield* Effect.forkChild(
        queue.send({ jobId: JOB_ID }, options)
      );
      yield* Effect.yieldNow;
      const interrupting = yield* Effect.forkChild(Fiber.interrupt(first));
      const second = yield* Effect.forkChild(
        queue.send({ jobId: JOB_ID }, options)
      );
      yield* Effect.yieldNow;
      finishStart();
      yield* Fiber.await(interrupting);
      yield* Fiber.await(second);
      expect(fake.start).toHaveBeenCalledTimes(1);
      yield* queue.send({ jobId: JOB_ID }, options);
      expect(fake.start).toHaveBeenCalledTimes(1);
      yield* built.close;
    })
  );
});

describe("JobQueue worker Layer", () => {
  it.effect("starts pg-boss and ensures the queue when built", () =>
    Effect.gen(function* workerAcquireGen() {
      const fake = fakeDriver();
      const built = yield* build(
        makeJobQueueLayers(() => fake.driver).workerLayer
      );
      expect(fake.start).toHaveBeenCalledTimes(1);
      expect(fake.ensureQueue).toHaveBeenCalledTimes(1);
      yield* built.close;
    })
  );

  it.effect(
    "fails the build with InternalError (driver text in cause only) when start fails",
    () =>
      Effect.gen(function* workerAcquireFailGen() {
        const fake = fakeDriver();
        fake.start.mockRejectedValueOnce(new Error(DRIVER_TEXT));
        const failure = yield* Effect.flip(
          build(makeJobQueueLayers(() => fake.driver).workerLayer)
        );
        expect(failure).toBeInstanceOf(InternalError);
        expect(failure).toMatchObject({
          reason: "pg-boss failed",
          cause: expect.objectContaining({ message: DRIVER_TEXT }),
        });
        expect(fake.stop).not.toHaveBeenCalled();
      })
  );

  it.effect(
    "releases with one graceful stop bounded by the Cap timeout ceiling",
    () =>
      Effect.gen(function* workerReleaseGen() {
        const fake = fakeDriver();
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).workerLayer
        );
        expect(fake.stop).not.toHaveBeenCalled();
        yield* built.close;
        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(fake.stop).toHaveBeenCalledWith({
          graceful: true,
          timeout: gracefulStopTimeoutMs(),
        });
      })
  );

  it.effect(
    "completes the release when stop fails, and refuses work and sends afterwards",
    () =>
      Effect.gen(function* workerReleaseFailGen() {
        const fake = fakeDriver();
        fake.stop.mockRejectedValueOnce(new Error("stop timed out"));
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).workerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        const worker = Context.get(built.context, JobQueueWorker);
        yield* built.close;

        const options = { expireInSeconds: 90, singletonKey: JOB_ID };
        const sendFailure = yield* Effect.flip(
          queue.send({ jobId: JOB_ID }, options)
        );
        expect(sendFailure).toBeInstanceOf(InternalError);
        const workFailure = yield* Effect.flip(
          worker.work(
            { localConcurrency: 1, pollingIntervalSeconds: 2 },
            async () => {}
          )
        );
        expect(workFailure).toBeInstanceOf(InternalError);
        expect(fake.send).not.toHaveBeenCalled();
        expect(fake.work).not.toHaveBeenCalled();
      })
  );

  it.effect(
    "keeps sends open while draining so an in-flight Job can enqueue its successor",
    () =>
      Effect.gen(function* workerDrainSendGen() {
        const fake = fakeDriver();
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).workerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        const options = { expireInSeconds: 90, singletonKey: JOB_ID };
        fake.stop.mockImplementationOnce(async () => {
          await Effect.runPromise(queue.send({ jobId: JOB_ID }, options));
        });
        yield* built.close;
        expect(fake.send).toHaveBeenCalledTimes(1);
      })
  );

  it.effect("registers the handler through the worker service", () =>
    Effect.gen(function* workerWorkGen() {
      const fake = fakeDriver();
      const built = yield* build(
        makeJobQueueLayers(() => fake.driver).workerLayer
      );
      const worker = Context.get(built.context, JobQueueWorker);
      const handler = async () => {};
      yield* worker.work(
        { localConcurrency: 1, pollingIntervalSeconds: 2 },
        handler
      );
      expect(fake.work).toHaveBeenCalledWith(
        { localConcurrency: 1, pollingIntervalSeconds: 2 },
        handler
      );
      yield* built.close;
    })
  );
});

describe("enqueueCapJobEffect", () => {
  it.effect(
    "sends the trimmed job id with the Cap-derived expire and singleton key",
    () =>
      Effect.gen(function* enqueueGen() {
        const recording = recordingJobQueue();
        yield* enqueueCapJobEffect(`  ${JOB_ID}  `, "network.dns.lookup").pipe(
          Effect.provide(recording.layer)
        );
        expect(recording.sends).toHaveLength(1);
        expect(recording.sends[0]?.payload).toEqual({ jobId: JOB_ID });
        expect(recording.sends[0]?.options.singletonKey).toBe(JOB_ID);
        expect(recording.sends[0]?.options.expireInSeconds).toBeGreaterThan(60);
      })
  );

  it.effect("rejects a blank job id without reaching the queue", () =>
    Effect.gen(function* enqueueBlankGen() {
      const recording = recordingJobQueue();
      const failure = yield* Effect.flip(
        enqueueCapJobEffect("   ", "network.dns.lookup").pipe(
          Effect.provide(recording.layer)
        )
      );
      expect(failure._tag).toBe("InvalidError");
      expect(recording.sends).toHaveLength(0);
    })
  );

  it.effect(
    "fails with InternalError, keeping driver text out of the reason, when the queue driver fails",
    () =>
      Effect.gen(function* enqueueDriverFailGen() {
        const fake = fakeDriver();
        fake.start.mockRejectedValue(new Error(DRIVER_TEXT));
        const { producerLayer } = makeJobQueueLayers(() => fake.driver);
        const failure = yield* Effect.flip(
          enqueueCapJobEffect(JOB_ID, "network.dns.lookup").pipe(
            Effect.provide(producerLayer)
          )
        );
        expect(failure).toBeInstanceOf(InternalError);
        expect(failure).toMatchObject({
          reason: "pg-boss failed",
          cause: expect.objectContaining({ message: DRIVER_TEXT }),
        });
      })
  );
});
