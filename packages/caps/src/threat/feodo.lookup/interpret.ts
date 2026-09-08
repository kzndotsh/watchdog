import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { ipSeedBatch } from "../../lib/collect/query-seed-batches";
import type { feodoLookupInput } from "./input";
import type { FeodoLookupSnapshot } from "./report-schema";

type FeodoInput = z.infer<typeof feodoLookupInput>;

function summarize(report: FeodoLookupSnapshot): string {
  if (!report.found) {
    return `Feodo Tracker (abuse.ch) for ${report.ip}: not listed`;
  }
  const parts: string[] = [`IP ${report.ip}`];
  if (report.malware) parts.push(report.malware);
  if (report.status) parts.push(`status=${report.status}`);
  if (report.lastOnline) parts.push(`lastOnline=${report.lastOnline}`);
  return `Feodo Tracker (abuse.ch) C2 listing: ${parts.join("; ")}`;
}

/** Pure interpret — report is FeodoLookupSnapshot JSON from run. */
export function interpretFeodoLookupReport(
  report: FeodoLookupSnapshot,
  opts: CapInterpretOpts<FeodoInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...ipSeedBatch(report.ip)],
    claimText: summarize(report),
    noEntitySummary:
      "Feodo Tracker lookup captured; no Entity to attach Identifiers",
  });
}
