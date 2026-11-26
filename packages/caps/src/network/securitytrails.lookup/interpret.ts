import type { z } from "zod";

import type { SecurityTrailsLookupSnapshot } from "#tools/network";

import { withSeedHost } from "../../lib/collect/eligible-domain-hosts";
import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  eligibleIpCount,
  identifierTruncationNote,
  ipValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { securityTrailsLookupInput } from "./input";

type SecurityTrailsInput = z.infer<typeof securityTrailsLookupInput>;

function summarize(
  report: SecurityTrailsLookupSnapshot,
  domains: readonly string[],
  ips: readonly string[]
): string {
  const subdomainTotal = eligibleDomainCount(domains);
  const ipTotal = eligibleIpCount(ips);
  const reported =
    report.subdomainCount !== null &&
    report.subdomainCount !== report.subdomains.length
      ? ` (SecurityTrails counts ${report.subdomainCount})`
      : "";
  const pages =
    report.historyPages !== null && report.historyPages > 1
      ? ` from page 1 of ${report.historyPages}`
      : "";
  return (
    `SecurityTrails for ${report.host}: ${subdomainTotal} domain(s)${reported}` +
    `${identifierTruncationNote(subdomainTotal, DOMAIN_IDENTIFIER_BATCH_LIMIT)}; ` +
    `${ipTotal} historical A IP(s)${pages}` +
    `${identifierTruncationNote(ipTotal, DOMAIN_IDENTIFIER_BATCH_LIMIT)}. ` +
    "A past resolution does not show who controls an address."
  );
}

/** Pure interpret: subdomains as domain Identifiers, historical A values as ip Identifiers. */
export function interpretSecurityTrailsLookupReport(
  report: SecurityTrailsLookupSnapshot,
  opts: CapInterpretOpts<SecurityTrailsInput>
): CapInterpretResult {
  const domains = withSeedHost(report.host, report.subdomains);
  const ips = report.ipHistory.map((s) => s.ip);
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...domainValuesBatch(domains, { limit: DOMAIN_IDENTIFIER_BATCH_LIMIT }),
      ...ipValuesBatch(ips, { limit: DOMAIN_IDENTIFIER_BATCH_LIMIT }),
    ],
    claimText: summarize(report, domains, ips),
    noEntitySummary:
      "SecurityTrails lookup captured; no Entity to attach Identifiers",
  });
}
