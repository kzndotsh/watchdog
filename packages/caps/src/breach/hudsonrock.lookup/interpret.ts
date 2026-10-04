import type { z } from "zod";

import type { HudsonrockLookupSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { hudsonrockLookupInput } from "./input";

type HudsonrockInput = z.infer<typeof hudsonrockLookupInput>;

function summarize(report: HudsonrockLookupSnapshot): string {
  if (!report.found) {
    return `Hudson Rock (infostealer exposure) for ${report.query}: not indexed in Hudson Rock`;
  }
  const newest = report.newestDate ? `, most recent ${report.newestDate}` : "";
  return `Hudson Rock (infostealer exposure) for ${report.query}: ${report.totalResults} exposure record(s)${newest}`;
}

/** Pure interpret — report is HudsonrockLookupSnapshot JSON from run. */
export function interpretHudsonrockLookupReport(
  report: HudsonrockLookupSnapshot,
  opts: CapInterpretOpts<HudsonrockInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.query, report.kind)],
    claimText: summarize(report),
    noEntitySummary:
      "Hudson Rock lookup captured; no Entity to attach Identifiers",
  });
}
