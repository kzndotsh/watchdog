import { Cause, Effect, Exit, Result } from "effect";

import {
  abortedToolsError,
  taggedToToolsError,
  toolsHttpClientLayer,
} from "@watchdog/tools";

import type { CapRun, CapRunResult } from "./define";

export async function runCap(effect: CapRun): Promise<CapRunResult> {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provide(toolsHttpClientLayer))
  );
  if (Exit.isSuccess(exit)) return exit.value;
  if (Cause.hasInterruptsOnly(exit.cause)) {
    throw abortedToolsError("aborted");
  }
  const failed = Cause.findFail(exit.cause);
  if (Result.isSuccess(failed)) {
    const reason = Result.getOrThrow(failed);
    throw taggedToToolsError(reason.error);
  }
  throw Cause.squash(exit.cause);
}
