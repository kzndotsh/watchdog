import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { virusTotalLookupInput } from "./input";
import type { VirusTotalLookupSnapshot } from "./report-schema";

type VirusTotalInput = z.infer<typeof virusTotalLookupInput>;

function summarize(report: VirusTotalLookupSnapshot): string {
  if (!report.found) {
    return `VirusTotal for ${report.query}: not indexed in VirusTotal`;
  }
  const parts: string[] = [`VirusTotal for ${report.query}`];
  if (report.reputation !== null) {
    parts.push(`reputation=${report.reputation}`);
  }
  if (report.malicious !== null) {
    parts.push(`malicious=${report.malicious}`);
  }
  if (report.suspicious !== null) {
    parts.push(`suspicious=${report.suspicious}`);
  }
  if (report.harmless !== null) {
    parts.push(`harmless=${report.harmless}`);
  }
  if (report.undetected !== null) {
    parts.push(`undetected=${report.undetected}`);
  }
  if (report.asn !== null) parts.push(`asn=${report.asn}`);
  if (report.asOwner) parts.push(`asOwner=${report.asOwner}`);
  if (report.country) parts.push(`country=${report.country}`);
  if (report.registrar) parts.push(`registrar=${report.registrar}`);
  return parts.join("; ");
}

/** Pure interpret — report is VirusTotalLookupSnapshot JSON from run. */
export function interpretVirusTotalLookupReport(
  report: VirusTotalLookupSnapshot,
  opts: CapInterpretOpts<VirusTotalInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.query, report.kind)],
    claimText: summarize(report),
    noEntitySummary:
      "VirusTotal lookup completed; no Entity to attach Identifiers",
  });
}
