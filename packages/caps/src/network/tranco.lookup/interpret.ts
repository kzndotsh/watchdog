import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { trancoLookupInput } from "./input";
import type { TrancoLookupSnapshot } from "./report-schema";

type TrancoInput = z.infer<typeof trancoLookupInput>;

function summarize(report: TrancoLookupSnapshot): string {
  if (!report.found || report.latestRank === null) {
    return `Tranco top-sites ranking for ${report.domain}: not in the top-1M (past ~30 days)`;
  }
  const date = report.latestDate ? ` on ${report.latestDate}` : "";
  return `Tranco top-sites ranking for ${report.domain}: rank ${report.latestRank}${date} (${report.ranksCount} day(s) observed)`;
}

/** Pure interpret — report is TrancoLookupSnapshot JSON from run. */
export function interpretTrancoLookupReport(
  report: TrancoLookupSnapshot,
  opts: CapInterpretOpts<TrancoInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.domain, "domain")],
    claimText: summarize(report),
    noEntitySummary: "Tranco ranking captured; no Entity to attach Identifiers",
  });
}
