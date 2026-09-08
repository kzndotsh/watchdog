import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { filterRelatedIdentifiers } from "../../lib/collect/filter-related-identifiers";
import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  identifierTruncationNote,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import type { leakixLookupInput } from "./input";
import type { LeakixLookupSnapshot } from "./report-schema";

type LeakixInput = z.infer<typeof leakixLookupInput>;

function summarize(
  report: LeakixLookupSnapshot,
  hostnames: readonly string[]
): string {
  if (!report.found) {
    return `LeakIX for ${report.query}: not indexed in LeakIX`;
  }
  const parts = [
    `${report.serviceCount} service(s)`,
    `${report.leakCount} leak(s)`,
  ];
  if (report.protocols.length > 0) {
    parts.push(`protocols: ${report.protocols.join(", ")}`);
  }
  const eligibleHostnames = eligibleDomainCount(hostnames);
  const hostnameNote = identifierTruncationNote(
    eligibleHostnames,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  if (hostnameNote !== "") {
    parts.push(`hostnames=${eligibleHostnames}${hostnameNote.trim()}`);
  }
  return `LeakIX for ${report.query}: ${parts.join("; ")}`;
}

/** Pure interpret — report is LeakixLookupSnapshot JSON from run. */
export function interpretLeakixLookupReport(
  report: LeakixLookupSnapshot,
  opts: CapInterpretOpts<LeakixInput>
): CapInterpretResult {
  const hostnames =
    report.kind === "domain"
      ? filterRelatedIdentifiers("domain", report.query, report.hostnames)
      : report.hostnames;

  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...querySeedBatches(report.query, report.kind),
      ...domainValuesBatch(hostnames, { limit: DOMAIN_IDENTIFIER_BATCH_LIMIT }),
    ],
    claimText: summarize(report, hostnames),
    noEntitySummary: "LeakIX lookup captured; no Entity to attach Claim",
  });
}
