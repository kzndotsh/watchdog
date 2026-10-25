import { Effect, Layer } from "effect";

import {
  httpClientLayer,
  outboundClientLayer,
  type EgressLedgerOptions,
  type EgressOptions,
  type ProviderCall,
} from "@watchdog/tools/http";
import { recordingEgress } from "@watchdog/tools/testing";

import type { CapRun, CapRunResult } from "../sdk";
import { runCapProvided } from "../sdk/run";

/**
 * Runs a Cap's `run` as a Job would: over an `Egress` that records every call, and returns what
 * it recorded beside the result. A failed run still throws as `runCap` does; read the ledger
 * of a failure with `recordedCalls`.
 */
export function createRecordedRun(
  options?: EgressLedgerOptions & EgressOptions
) {
  const { layer, ledger } = recordingEgress(options);
  const stack = httpClientLayer.pipe(
    Layer.provideMerge(layer),
    Layer.provide(outboundClientLayer)
  );
  return {
    run: async (effect: CapRun): Promise<CapRunResult> =>
      runCapProvided(effect.pipe(Effect.provide(stack))),
    recordedCalls: (): readonly ProviderCall[] => ledger.drain(),
  };
}
