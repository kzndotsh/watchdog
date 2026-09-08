import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { ipSeedBatch } from "../../lib/collect/query-seed-batches";
import type { honeydbLookupInput } from "./input";
import type { HoneydbLookupSnapshot } from "./report-schema";

type HoneydbInput = z.infer<typeof honeydbLookupInput>;

function summarize(report: HoneydbLookupSnapshot): string {
  if (!report.found) {
    return `HoneyDB: ${report.ip}: IP not indexed`;
  }
  const hasSignals =
    report.isTor ||
    report.isThreat ||
    report.internetScanner ||
    report.historyEventCount > 0;
  const parts: string[] = [`IP ${report.ip}`];
  if (report.asn !== null) parts.push(`ASN=${report.asn}`);
  if (report.country) parts.push(report.country);
  if (report.isTor) parts.push("Tor");
  if (report.isThreat) parts.push("threat-listed");
  if (report.internetScanner) parts.push("internet-scanner");
  if (report.historyEventCount > 0) {
    parts.push(`${report.historyEventCount} honeypot event(s)`);
  }
  if (!hasSignals) parts.push("no threat indicators");
  return `HoneyDB: ${parts.join("; ")}`;
}

/** Pure interpret — report is HoneydbLookupSnapshot JSON from run. */
export function interpretHoneydbLookupReport(
  report: HoneydbLookupSnapshot,
  opts: CapInterpretOpts<HoneydbInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...ipSeedBatch(report.ip)],
    claimText: summarize(report),
    noEntitySummary: "HoneyDB lookup captured; no Entity to attach Identifiers",
  });
}
