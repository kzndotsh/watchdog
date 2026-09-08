import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  identifierTruncationNote,
  ipSeedBatch,
} from "../../lib/collect/query-seed-batches";
import type { dnsReverseInput } from "./input";
import type { DnsReverseSnapshot } from "./report-schema";

type ReverseInput = z.infer<typeof dnsReverseInput>;

function summarize(report: DnsReverseSnapshot): string {
  if (report.hostnames.length === 0) {
    return `PTR for ${report.ip}: none`;
  }
  const eligibleHosts = domainValuesBatch(report.hostnames)[0]?.values ?? [];
  const eligibleHostnames = eligibleHosts.length;
  const hostnameNote = identifierTruncationNote(
    eligibleHostnames,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  if (hostnameNote !== "") {
    return `PTR for ${report.ip}: ${eligibleHostnames} hostname(s)${hostnameNote}`;
  }
  return `PTR for ${report.ip}: ${eligibleHosts.join(", ")}`;
}

/** Pure interpret — report is DnsReverseSnapshot JSON from run. */
export function interpretDnsReverseReport(
  report: DnsReverseSnapshot,
  opts: CapInterpretOpts<ReverseInput>
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
    noEntitySummary: "PTR captured; no Entity to attach Identifiers",
  });
}
