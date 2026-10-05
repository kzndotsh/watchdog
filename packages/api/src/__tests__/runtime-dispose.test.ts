import { Effect } from "effect";
import { describe, expect, it, vi } from "vitest";

import {
  JobQueue,
  makeJobQueueLayers,
  type BossDriver,
} from "@watchdog/core/jobs";

import { makeAppRuntime } from "../runtime";

const SEND = Effect.gen(function* sendGen() {
  const queue = yield* JobQueue;
  yield* queue.send(
    { jobId: "11111111-1111-4111-8111-000000000001" },
    { expireInSeconds: 60, singletonKey: "k" }
  );
});

function fakeDriver() {
  const stop = vi.fn(async () => {});
  const driver: BossDriver = {
    start: vi.fn(async () => {}),
    stop,
    ensureQueue: vi.fn(async () => {}),
    send: vi.fn(async () => {}),
    work: vi.fn(async () => {}),
  };
  return { driver, stop };
}

/** A stand-in for `import.meta.hot` that lets the test fire its hooks. */
function fakeHot() {
  const disposers: (() => void | Promise<void>)[] = [];
  const reloaders: (() => void | Promise<void>)[] = [];
  return {
    hot: {
      dispose: (callback: () => void | Promise<void>) => {
        disposers.push(callback);
      },
      on: (event: string, callback: () => void | Promise<void>) => {
        if (event === "vite:beforeFullReload") reloaders.push(callback);
      },
    },
    /** A module-level HMR update. */
    update: async () => Promise.all(disposers.map((callback) => callback())),
    /** The SSR full reload `vite dev` does on a source edit. */
    reload: async () => Promise.all(reloaders.map((callback) => callback())),
  };
}

describe("makeAppRuntime", () => {
  it("stops the producer exactly once on a Vite full reload, then again is a no-op", async () => {
    const fake = fakeDriver();
    const { hot, reload, update } = fakeHot();
    const runtime = makeAppRuntime(
      makeJobQueueLayers(() => fake.driver).producerLayer,
      hot
    );
    await runtime.runPromise(SEND);
    expect(fake.stop).not.toHaveBeenCalled();

    await reload();
    expect(fake.stop).toHaveBeenCalledTimes(1);

    // A second dispose (explicit, a repeated reload or an update) is a no-op.
    await runtime.dispose();
    await reload();
    await update();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it("also stops the producer on a module-level HMR update", async () => {
    const fake = fakeDriver();
    const { hot, update } = fakeHot();
    const runtime = makeAppRuntime(
      makeJobQueueLayers(() => fake.driver).producerLayer,
      hot
    );
    await runtime.runPromise(SEND);
    await update();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });

  it("disposing a runtime that never ran starts and stops nothing", async () => {
    const fake = fakeDriver();
    const { hot, reload } = fakeHot();
    makeAppRuntime(makeJobQueueLayers(() => fake.driver).producerLayer, hot);
    await reload();
    expect(fake.stop).not.toHaveBeenCalled();
  });

  it("does nothing without a hot context (production)", async () => {
    const fake = fakeDriver();
    const runtime = makeAppRuntime(
      makeJobQueueLayers(() => fake.driver).producerLayer,
      undefined
    );
    await runtime.runPromise(SEND);
    expect(fake.stop).not.toHaveBeenCalled();
    await runtime.dispose();
    expect(fake.stop).toHaveBeenCalledTimes(1);
  });
});
