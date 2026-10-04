import { Cause, Effect, Exit, Result } from "effect";

import { abortedError } from "@watchdog/tools/errors";
import { toolsHttpClientLayer } from "@watchdog/tools/http";

import type { CapRun, CapRunResult } from "./define";

export async function runCap(effect: CapRun): Promise<CapRunResult> {
  const exit = await Effect.runPromiseExit(
    effect.pipe(Effect.provide(toolsHttpClientLayer))
  );
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
