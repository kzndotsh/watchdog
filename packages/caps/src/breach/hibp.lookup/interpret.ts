import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { HibpLookupSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { hibpLookupInput } from "./input";

type HibpInput = z.infer<typeof hibpLookupInput>;

function summarize(report: HibpLookupSnapshot): string {
  if (!report.found) {
    return `HIBP for ${report.email}: no breaches reported`;
  }
  const names = report.breaches.map((b) => b.name).slice(0, 12);
  const more =
    report.breachCount > names.length
      ? ` (+${report.breachCount - names.length} more)`
      : "";
  return `HIBP for ${report.email}: ${report.breachCount} breach(es): ${names.join(", ")}${more}`;
}

/** Pure interpret — report is HibpLookupSnapshot JSON from run. */
export function interpretHibpLookupReport(
  report: HibpLookupSnapshot,
  opts: CapInterpretOpts<HibpInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.email, "email")],
    claimText: summarize(report),
    noEntitySummary: "HIBP lookup completed; no Entity to attach Identifiers",
  });
}
