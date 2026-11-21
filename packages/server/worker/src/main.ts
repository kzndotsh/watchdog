// First: the worker logs in as its own role (DATABASE_URL_WORKER), before the environment is parsed.
import "#env/worker";
import "#env/server";
import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { jobQueueWorkerLayer } from "#core/jobs";
import { evlogEffectLoggerLayer } from "#log";

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
