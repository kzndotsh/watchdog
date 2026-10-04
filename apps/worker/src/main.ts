import "@watchdog/env/server";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { jobQueueWorkerLayer } from "@watchdog/core/worker";
import { evlogEffectLoggerLayer } from "@watchdog/log";

import { bootWorkerEffect } from "./boot-worker";
import { provideWorkerLayers } from "./layers";

export { bootWorkerEffect };

if (process.env.VITEST !== "true") {
  NodeRuntime.runMain(
    provideWorkerLayers(bootWorkerEffect, jobQueueWorkerLayer).pipe(
      Effect.provide(evlogEffectLoggerLayer)
    ),
    { disableErrorReporting: true }
  );
}
