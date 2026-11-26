import type { z } from "zod";

import type {
  SecurityTrailsDnsHistory,
  SecurityTrailsLookupSnapshot,
} from "#tools/network";

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

/** A and AAAA answers are addresses; MX, NS, SOA and TXT stay in the Claim and the Evidence. */
export function historicalIps(
  history: readonly SecurityTrailsDnsHistory[]
): string[] {
  return history
    .filter((h) => h.type === "a" || h.type === "aaaa")
    .flatMap((h) => h.records.map((r) => r.value));
}

function historyPart(h: SecurityTrailsDnsHistory): string {
  const pages =
    h.pages !== null && h.pages > 1 ? ` (page 1 of ${h.pages})` : "";
  return `${h.type.toUpperCase()} ${h.records.length}${pages}`;
}

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
  const history =
    report.dnsHistory.length > 0
      ? report.dnsHistory.map(historyPart).join(", ")
      : "none requested";
  return (
    `SecurityTrails for ${report.host}: ${subdomainTotal} domain(s)${reported}` +
    `${identifierTruncationNote(subdomainTotal, DOMAIN_IDENTIFIER_BATCH_LIMIT)}; ` +
    `DNS history ${history}; ${ipTotal} historical IP(s)` +
    `${identifierTruncationNote(ipTotal, DOMAIN_IDENTIFIER_BATCH_LIMIT)}. ` +
    "A past record does not show who controls a name or address."
  );
}

/** Pure interpret: subdomains as domain Identifiers, historical A/AAAA values as ip Identifiers. */
export function interpretSecurityTrailsLookupReport(
  report: SecurityTrailsLookupSnapshot,
  opts: CapInterpretOpts<SecurityTrailsInput>
): CapInterpretResult {
  const domains = withSeedHost(report.host, report.subdomains);
  const ips = historicalIps(report.dnsHistory);
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
