import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { ipSeedBatch } from "../../lib/collect/query-seed-batches";
import type { fireholLookupInput } from "./input";
import type { FireholLookupSnapshot } from "./report-schema";

type FireholInput = z.infer<typeof fireholLookupInput>;

function summarize(report: FireholLookupSnapshot): string {
  return report.found
    ? `FireHOL ${report.list}: ${report.ip} is listed (dshield/feodo/fullbogons/spamhaus_drop composite)`
    : `FireHOL ${report.list}: ${report.ip} is not listed`;
}

/** Pure interpret — report is FireholLookupSnapshot JSON from run. */
export function interpretFireholLookupReport(
  report: FireholLookupSnapshot,
  opts: CapInterpretOpts<FireholInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...ipSeedBatch(report.ip)],
    claimText: summarize(report),
    noEntitySummary:
      "FireHOL blocklist check captured; no Entity to attach Identifiers",
  });
}
