import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { ipSeedBatch } from "../../lib/collect/query-seed-batches";
import type { torExitLookupInput } from "./input";
import type { TorExitLookupSnapshot } from "./report-schema";

type TorExitInput = z.infer<typeof torExitLookupInput>;

function summarize(report: TorExitLookupSnapshot): string {
  return report.isExit
    ? `Tor exit-address list: ${report.ip} is a current Tor exit node`
    : `Tor exit-address list: ${report.ip} is not a current Tor exit node`;
}

/** Pure interpret — report is TorExitLookupSnapshot JSON from run. */
export function interpretTorExitLookupReport(
  report: TorExitLookupSnapshot,
  opts: CapInterpretOpts<TorExitInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...ipSeedBatch(report.ip)],
    claimText: summarize(report),
    noEntitySummary:
      "Tor exit-list check captured; no Entity to attach Identifiers",
  });
}
