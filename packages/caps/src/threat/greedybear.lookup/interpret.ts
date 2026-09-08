import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { greedybearLookupInput } from "./input";
import type { GreedybearLookupSnapshot } from "./report-schema";

type GreedybearInput = z.infer<typeof greedybearLookupInput>;

function summarize(report: GreedybearLookupSnapshot): string {
  return report.found
    ? `GreedyBear (Honeynet) scanner feed: ${report.query} seen scanning honeypots (recent)`
    : `GreedyBear (Honeynet) scanner feed: ${report.query} not seen scanning honeypots (recent)`;
}

/** Pure interpret — report is GreedybearLookupSnapshot JSON from run. */
export function interpretGreedybearLookupReport(
  report: GreedybearLookupSnapshot,
  opts: CapInterpretOpts<GreedybearInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.query, report.kind)],
    claimText: summarize(report),
    noEntitySummary:
      "GreedyBear lookup captured; no Entity to attach Identifiers",
  });
}
