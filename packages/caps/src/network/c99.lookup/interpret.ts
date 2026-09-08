import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { withSeedHost } from "../../lib/collect/eligible-domain-hosts";
import { interpretTypedIdentifiers } from "../../lib/collect/interpret-typed-identifiers";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  eligibleDomainCount,
  identifierTruncationNote,
} from "../../lib/collect/query-seed-batches";
import type { c99LookupInput } from "./input";
import type { C99LookupSnapshot } from "./report-schema";

type C99Input = z.infer<typeof c99LookupInput>;

function summarize(report: C99LookupSnapshot): string {
  const cf = report.hits.filter((h) => h.cloudflare === true).length;
  const err = report.error ? `; error=${report.error}` : "";
  const domainTotal = eligibleDomainCount(
    withSeedHost(report.host, report.domains)
  );
  const domainNote = identifierTruncationNote(
    domainTotal,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  return `C99 for ${report.host}: ${domainTotal} subdomain(s)${domainNote}, cloudflare=${cf}${err}`;
}

/** Pure interpret — subdomain hits as domain Identifiers when Entity set. */
export function interpretC99LookupReport(
  report: C99LookupSnapshot,
  opts: CapInterpretOpts<C99Input>
): CapInterpretResult {
  return interpretTypedIdentifiers({
    entityId: opts.input.entityId,
    type: "domain",
    values: withSeedHost(report.host, report.domains),
    claimText: summarize(report),
    noEntitySummary: "C99 lookup captured; no Entity to attach Identifiers",
    limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
  });
}
