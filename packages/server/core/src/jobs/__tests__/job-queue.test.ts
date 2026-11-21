import { describe, expect, it } from "@effect/vitest";
import { Context, Effect, Exit, Fiber, Layer, Option, Scope } from "effect";
import { vi } from "vitest";

import { InternalError } from "../../errors/tagged-errors";
import {
  JobQueue,
  JobQueueWorker,
  makeJobQueueLayers,
  queueAbortOf,
  type BossDriver,
  type QueueTx,
} from "../job-queue";
import { gracefulStopTimeoutMs } from "../timeouts";

vi.mock("#env/server", () => ({
  env: { DATABASE_URL: "postgresql://x:x@127.0.0.1:5432/x" },
}));

const JOB_ID = "11111111-1111-4111-8111-000000000001";
const DRIVER_TEXT = "connect ECONNREFUSED 10.0.0.7:5432 (user=boss)";
/** A producing transaction the fake driver never runs SQL on. */
const TX: QueueTx = { executeSql: async () => ({ rows: [] }) };

function fakeDriver() {
  const start = vi.fn(async () => {});
  const stop = vi.fn(async () => {});
  const ensureQueue = vi.fn(async () => {});
  const send = vi.fn(async () => {});
  const cancel = vi.fn(async () => {});
  const work = vi.fn(async () => {});
  const driver: BossDriver = { start, stop, ensureQueue, send, cancel, work };
  return { driver, start, stop, ensureQueue, send, cancel, work };
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
      const options = {
        lane: "quick" as const,
        expireInSeconds: 90,
        singletonKey: JOB_ID,
      };
      yield* queue.send(TX, { jobId: JOB_ID }, options);
      yield* queue.send(TX, { jobId: JOB_ID }, options);
      expect(fake.start).toHaveBeenCalledTimes(1);
      expect(fake.ensureQueue).toHaveBeenCalledTimes(1);
      expect(fake.send).toHaveBeenCalledTimes(2);
      expect(fake.send).toHaveBeenCalledWith(TX, { jobId: JOB_ID }, options);
      yield* built.close;
    })
  );

  it.effect(
    "cancels on the caller's transaction, one call per queue, starting the boss first",
    () =>
      Effect.gen(function* producerCancelGen() {
        const fake = fakeDriver();
        const built = yield* build(
          makeJobQueueLayers(() => fake.driver).producerLayer
        );
        const queue = Context.get(built.context, JobQueue);
        yield* queue.cancel(TX, []);
        expect(fake.start).not.toHaveBeenCalled();
        yield* queue.cancel(TX, [
          { id: "d1", queue: "watchdog.cap-jobs.quick" },
          { id: "d2", queue: "watchdog.cap-jobs.heavy" },
          { id: "d3", queue: "watchdog.cap-jobs.quick" },
        ]);
        expect(fake.start).toHaveBeenCalledTimes(1);
        expect(fake.cancel.mock.calls).toEqual([
          [TX, "watchdog.cap-jobs.quick", ["d1", "d3"]],
          [TX, "watchdog.cap-jobs.heavy", ["d2"]],
        ]);
        yield* built.close;
        const closed = yield* Effect.flip(
          queue.cancel(TX, [{ id: "d4", queue: "watchdog.cap-jobs.quick" }])
        );
        expect(closed).toBeInstanceOf(InternalError);
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
        const options = {
          lane: "quick" as const,
          expireInSeconds: 90,
          singletonKey: JOB_ID,
        };
        const failure = yield* Effect.flip(
          queue.send(TX, { jobId: JOB_ID }, options)
        );
        expect(failure).toBeInstanceOf(InternalError);
        yield* queue.send(TX, { jobId: JOB_ID }, options);
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
        const options = {
          lane: "quick" as const,
          expireInSeconds: 90,
          singletonKey: JOB_ID,
        };
        yield* queue.send(TX, { jobId: JOB_ID }, options);
        yield* built.close;

        expect(fake.stop).toHaveBeenCalledTimes(1);
        expect(fake.stop).toHaveBeenCalledWith({
          graceful: true,
          timeout: 5000,
        });

        const failure = yield* Effect.flip(
          queue.send(TX, { jobId: JOB_ID }, options)
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
  const options = {
    lane: "quick" as const,
    expireInSeconds: 90,
    singletonKey: JOB_ID,
  };

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
          queue.send(TX, { jobId: JOB_ID }, options)
        );
        expect(failure).toBeInstanceOf(InternalError);
        yield* queue.send(TX, { jobId: JOB_ID }, options);
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
        yield* Effect.flip(queue.send(TX, { jobId: JOB_ID }, options));
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
          Effect.result(queue.send(TX, { jobId: JOB_ID }, options))
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
        queue.send(TX, { jobId: JOB_ID }, options)
      );
      yield* Effect.yieldNow;
      const interrupting = yield* Effect.forkChild(Fiber.interrupt(first));
      const second = yield* Effect.forkChild(
        queue.send(TX, { jobId: JOB_ID }, options)
      );
      yield* Effect.yieldNow;
      finishStart();
      yield* Fiber.await(interrupting);
      yield* Fiber.await(second);
      expect(fake.start).toHaveBeenCalledTimes(1);
      yield* queue.send(TX, { jobId: JOB_ID }, options);
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

        const options = {
          lane: "quick" as const,
          expireInSeconds: 90,
          singletonKey: JOB_ID,
        };
        const sendFailure = yield* Effect.flip(
          queue.send(TX, { jobId: JOB_ID }, options)
        );
        expect(sendFailure).toBeInstanceOf(InternalError);
        const workFailure = yield* Effect.flip(
          worker.work(
            { lane: "quick", localConcurrency: 1, pollingIntervalSeconds: 2 },
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
        const options = {
          lane: "quick" as const,
          expireInSeconds: 90,
          singletonKey: JOB_ID,
        };
        fake.stop.mockImplementationOnce(async () => {
          await Effect.runPromise(queue.send(TX, { jobId: JOB_ID }, options));
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
        { lane: "quick", localConcurrency: 1, pollingIntervalSeconds: 2 },
        handler
      );
      expect(fake.work).toHaveBeenCalledWith(
        { lane: "quick", localConcurrency: 1, pollingIntervalSeconds: 2 },
        handler
      );
      yield* built.close;
    })
  );
});

describe("queueAbortOf: pg-boss's abort reason", () => {
  it("a reason given by the heartbeat is a lost claim", () => {
    const controller = new AbortController();
    controller.abort(
      new Error("job x is no longer active under this worker's claim")
    );
    const reason = controller.signal.reason;
    expect(queueAbortOf(reason, { stopping: false, pastExpiry: false })).toBe(
      "claim_lost"
    );
    expect(queueAbortOf(reason, { stopping: true, pastExpiry: false })).toBe(
      "claim_lost"
    );
  });

  it("a reasonless abort is an expiry, or a stop giving up while the queue stops", () => {
    const controller = new AbortController();
    controller.abort();
    const reason = controller.signal.reason;
    expect(queueAbortOf(reason, { stopping: false, pastExpiry: true })).toBe(
      "expired"
    );
    expect(queueAbortOf(reason, { stopping: true, pastExpiry: false })).toBe(
      "stopping"
    );
  });

  it("an attempt past its expiry stays an expiry while the queue stops", () => {
    const controller = new AbortController();
    controller.abort();
    expect(
      queueAbortOf(controller.signal.reason, {
        stopping: true,
        pastExpiry: true,
      })
    ).toBe("expired");
  });
});
