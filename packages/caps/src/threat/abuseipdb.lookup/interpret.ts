import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  domainValuesBatch,
  ipSeedBatch,
} from "../../lib/collect/query-seed-batches";
import type { abuseIpdbLookupInput } from "./input";
import type { AbuseIpdbLookupSnapshot } from "./report-schema";

type AbuseIpdbInput = z.infer<typeof abuseIpdbLookupInput>;

function summarize(report: AbuseIpdbLookupSnapshot): string {
  const parts: string[] = [`AbuseIPDB for ${report.ip}`];
  if (report.abuseConfidenceScore !== null) {
    parts.push(`confidence=${report.abuseConfidenceScore}%`);
  }
  if (report.totalReports !== null) {
    parts.push(`reports=${report.totalReports}`);
  }
  if (report.numDistinctUsers !== null) {
    parts.push(`reporters=${report.numDistinctUsers}`);
  }
  if (report.lastReportedAt)
    parts.push(`lastReported=${report.lastReportedAt}`);
  if (report.isp) parts.push(`isp=${report.isp}`);
  if (report.domain) parts.push(`domain=${report.domain}`);
  if (report.isWhitelisted === true) parts.push("whitelisted");
  return parts.join("; ");
}

/** Pure interpret — report is AbuseIpdbLookupSnapshot JSON from run. */
export function interpretAbuseIpdbLookupReport(
  report: AbuseIpdbLookupSnapshot,
  opts: CapInterpretOpts<AbuseIpdbInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...ipSeedBatch(report.ip),
      ...domainValuesBatch(report.domain ? [report.domain] : []),
    ],
    claimText: summarize(report),
    noEntitySummary: "AbuseIPDB lookup completed; no Entity to attach Claim",
  });
}
