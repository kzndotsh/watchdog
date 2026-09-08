import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { withSeedHost } from "../../lib/collect/eligible-domain-hosts";
import { interpretTypedIdentifiers } from "../../lib/collect/interpret-typed-identifiers";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  eligibleDomainCount,
  identifierTruncationNote,
} from "../../lib/collect/query-seed-batches";
import type { certspotterLookupInput } from "./input";
import type { CertspotterLookupSnapshot } from "./report-schema";

type CertspotterInput = z.infer<typeof certspotterLookupInput>;

function summarize(report: CertspotterLookupSnapshot): string {
  const domainTotal = eligibleDomainCount(
    withSeedHost(report.host, report.domains)
  );
  const domainNote = identifierTruncationNote(
    domainTotal,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  return `Cert Spotter for ${report.host}: ${report.issuances.length} issuance(s), ${domainTotal} domain(s)${domainNote}`;
}

/** Pure interpret — CT dns_names as domain Identifiers when Entity set. */
export function interpretCertspotterLookupReport(
  report: CertspotterLookupSnapshot,
  opts: CapInterpretOpts<CertspotterInput>
): CapInterpretResult {
  return interpretTypedIdentifiers({
    entityId: opts.input.entityId,
    type: "domain",
    values: withSeedHost(report.host, report.domains),
    claimText: summarize(report),
    noEntitySummary:
      "Cert Spotter lookup captured; no Entity to attach Identifiers",
    limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
  });
}
