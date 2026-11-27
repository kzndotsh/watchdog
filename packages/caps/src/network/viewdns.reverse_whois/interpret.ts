import type { z } from "zod";

import type { ViewDnsReverseWhoisSnapshot } from "#tools/network";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  identifierTruncationNote,
} from "../../lib/collect/query-seed-batches";
import { viewDnsListNotes } from "../../lib/collect/viewdns-reverse-host";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { viewDnsReverseWhoisInput } from "./input";

type ViewDnsReverseWhoisInput = z.infer<typeof viewDnsReverseWhoisInput>;

const REGISTRARS_NAMED = 3;

/** The most frequent registrars, as "Name (count)", or an empty string when none is known. */
function registrarsPart(report: ViewDnsReverseWhoisSnapshot): string {
  const counts = new Map<string, number>();
  for (const match of report.matches) {
    if (match.registrar === null) continue;
    counts.set(match.registrar, (counts.get(match.registrar) ?? 0) + 1);
  }
  const top = [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, REGISTRARS_NAMED)
    .map(([name, count]) => `${name} (${count})`);
  return top.length === 0 ? "" : ` Registrars include ${top.join(", ")}.`;
}

/** Pure interpret: the domains whose WHOIS record mentions the query, as domain Identifiers. */
export function interpretViewDnsReverseWhoisReport(
  report: ViewDnsReverseWhoisSnapshot,
  opts: CapInterpretOpts<ViewDnsReverseWhoisInput>
): CapInterpretResult {
  const domains = report.matches.map((m) => m.domain);
  const total = eligibleDomainCount(domains);
  const notes = viewDnsListNotes(total, report.resultCount, report.totalPages);
  const truncation = identifierTruncationNote(
    total,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: domainValuesBatch(domains, {
      limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
    }),
    claimText:
      `ViewDNS lists ${total} domain(s) whose registration record mentions "${report.query}"` +
      `${notes}${truncation}.${registrarsPart(report)} ` +
      "A WHOIS match does not prove the same registrant: privacy services and common names collide.",
    noEntitySummary:
      "ViewDNS reverse WHOIS captured; no Entity to attach Identifiers",
  });
}
