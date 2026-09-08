import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { withSeedHost } from "../../lib/collect/eligible-domain-hosts";
import { interpretTypedIdentifiers } from "../../lib/collect/interpret-typed-identifiers";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  eligibleDomainCount,
  identifierTruncationNote,
} from "../../lib/collect/query-seed-batches";
import type { ctLookupInput } from "./input";
import type { CtLookupSnapshot } from "./report-schema";

type CtInput = z.infer<typeof ctLookupInput>;

function summarize(report: CtLookupSnapshot): string {
  const domainTotal = eligibleDomainCount(
    withSeedHost(report.host, report.domains)
  );
  const domainNote = identifierTruncationNote(
    domainTotal,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  const e = report.entries.length;
  return `CT for ${report.host}: ${e} cert row(s), ${domainTotal} domain name(s)${domainNote} via ${report.source}`;
}

/** Pure interpret — report is CtLookupSnapshot JSON from run. */
export function interpretCtReport(
  report: CtLookupSnapshot,
  opts: CapInterpretOpts<CtInput>
): CapInterpretResult {
  return interpretTypedIdentifiers({
    entityId: opts.input.entityId,
    type: "domain",
    values: withSeedHost(report.host, report.domains),
    claimText: summarize(report),
    noEntitySummary: "CT captured; no Entity to attach Identifiers",
    limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
  });
}
