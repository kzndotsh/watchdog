import type { ViewDnsReverseHostSnapshot } from "#tools/network";

import type { CapInterpretResult } from "../../sdk";
import { interpretIdentifierBatches } from "./interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  identifierTruncationNote,
} from "./query-seed-batches";

const SERVER_NOUN = { ns: "nameserver", mx: "mail server" } as const;

/** What ViewDNS says about the size of the list, when it differs from what came back. */
export function viewDnsListNotes(
  returned: number,
  counted: number | null,
  totalPages: number | null
): string {
  const count =
    counted !== null && counted !== returned
      ? ` (ViewDNS counts ${counted})`
      : "";
  const pages =
    totalPages !== null && totalPages > 1 ? ` (page 1 of ${totalPages})` : "";
  return `${count}${pages}`;
}

/**
 * Pure interpret for ViewDNS reverse NS and reverse MX: the domains on the server as domain
 * Identifiers. The queried server is not proposed as a found domain.
 *
 * @canonical `interpretViewDnsReverseHost`: The interpret shared by the ViewDNS reverse NS and reverse MX Caps (one report shape; `via` picks the wording)
 */
export function interpretViewDnsReverseHost(
  report: ViewDnsReverseHostSnapshot,
  entityId: string | undefined
): CapInterpretResult {
  const domains = report.domains.filter((d) => d !== report.server);
  const total = eligibleDomainCount(domains);
  const noun = SERVER_NOUN[report.via];
  const notes = viewDnsListNotes(total, report.domainCount, report.totalPages);
  const truncation = identifierTruncationNote(
    total,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  return interpretIdentifierBatches({
    entityId,
    batches: domainValuesBatch(domains, {
      limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
    }),
    claimText:
      `ViewDNS lists ${total} domain(s) using ${noun} ${report.server}${notes}${truncation}. ` +
      `Sharing a ${noun} does not show common ownership; large hosts serve millions of domains.`,
    noEntitySummary: `ViewDNS reverse ${report.via.toUpperCase()} captured; no Entity to attach Identifiers`,
  });
}
