import { Cause, Effect, Exit, Result } from "effect";

import { abortedError, type ToolsTag } from "@watchdog/tools/errors";
import { toolsHttpClientLayer } from "@watchdog/tools/http";

import type { CapRun, CapRunResult } from "./define";

/** The Promise edge: a Cap's own failure is thrown as the tag itself, a cancel as `AbortedError`. */
export async function runCapProvided(
  effect: Effect.Effect<CapRunResult, ToolsTag>
): Promise<CapRunResult> {
  const exit = await Effect.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;
  if (Cause.hasInterruptsOnly(exit.cause)) {
    throw abortedError("aborted");
  }
  const failed = Cause.findFail(exit.cause);
  if (Result.isSuccess(failed)) {
    const reason = Result.getOrThrow(failed);
    throw reason.error;
  }
  throw Cause.squash(exit.cause);
}

export async function runCap(effect: CapRun): Promise<CapRunResult> {
  return runCapProvided(effect.pipe(Effect.provide(toolsHttpClientLayer)));
}
