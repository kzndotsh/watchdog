import { Effect, Layer } from "effect";

import {
  Egress,
  egressRecordingTo,
  unrecordedEgressLayer,
} from "../http/egress";
import {
  createEgressLedger,
  type EgressLedger,
  type EgressLedgerOptions,
} from "../http/egress-ledger";
import { OutboundClient } from "../http/outbound-client";

export { unrecordedEgressLayer };

/**
 * An `Egress` that records into a ledger the test holds, over the `OutboundClient` it is
 * built on. Same wiring as a Job's, so a test sees what core would drain.
 */
export function recordingEgress(options?: EgressLedgerOptions): {
  readonly layer: Layer.Layer<Egress, never, OutboundClient>;
  readonly ledger: EgressLedger;
} {
  const ledger = createEgressLedger(options);
  const layer = Layer.effect(
    Egress,
    Effect.gen(function* recordingEgressGen() {
      const outbound = yield* OutboundClient;
      return egressRecordingTo(outbound, ledger);
    })
  );
  return { layer, ledger };
}
