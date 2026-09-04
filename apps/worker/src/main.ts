import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { JobFibers } from "@watchdog/core/worker";
import { evlogEffectLoggerLayer } from "@watchdog/log";

import { bootWorkerEffect } from "./boot-worker";

export { bootWorkerEffect };

if (process.env.VITEST !== "true") {
  NodeRuntime.runMain(
    bootWorkerEffect.pipe(
      Effect.provide(JobFibers.layer),
      Effect.provide(evlogEffectLoggerLayer)
    ),
    { disableErrorReporting: true }
  );
}
