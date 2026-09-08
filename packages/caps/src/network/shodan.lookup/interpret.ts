import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  identifierTruncationNote,
  ipSeedBatch,
} from "../../lib/collect/query-seed-batches";
import type { shodanLookupInput } from "./input";
import type { ShodanLookupSnapshot } from "./report-schema";

type ShodanInput = z.infer<typeof shodanLookupInput>;

function summarize(report: ShodanLookupSnapshot): string {
  if (!report.found) {
    return `Shodan for ${report.ip}: not indexed in Shodan`;
  }
  const parts: string[] = [`Shodan for ${report.ip}`];
  if (report.org) parts.push(`org=${report.org}`);
  if (report.asn) parts.push(`asn=${report.asn}`);
  if (report.ports.length > 0) {
    parts.push(`ports=${report.ports.join(",")}`);
  }
  const eligibleHostnames = eligibleDomainCount(report.hostnames);
  const hostnameNote = identifierTruncationNote(
    eligibleHostnames,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  if (hostnameNote !== "") {
    parts.push(`hostnames=${eligibleHostnames}${hostnameNote.trim()}`);
  }
  return parts.join("; ");
}

/** Pure interpret — report is ShodanLookupSnapshot JSON from run. */
export function interpretShodanLookupReport(
  report: ShodanLookupSnapshot,
  opts: CapInterpretOpts<ShodanInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...ipSeedBatch(report.ip),
      ...domainValuesBatch(report.hostnames, {
        limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
      }),
    ],
    claimText: summarize(report),
    noEntitySummary: "Shodan lookup captured; no Entity to attach Identifiers",
  });
}
