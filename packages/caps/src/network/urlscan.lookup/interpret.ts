import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { withSeedHost } from "../../lib/collect/eligible-domain-hosts";
import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  eligibleUrlCount,
  identifierTruncationNote,
  URL_IDENTIFIER_BATCH_LIMIT,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { urlscanLookupInput } from "./input";
import type { UrlscanLookupSnapshot } from "./report-schema";

type UrlscanInput = z.infer<typeof urlscanLookupInput>;

function summarize(report: UrlscanLookupSnapshot): string {
  const total =
    report.total === null
      ? `${report.hits.length} hit(s)`
      : `total≈${report.total}`;
  const urlTotal = eligibleUrlCount(report.urls);
  const domainTotal = eligibleDomainCount(
    withSeedHost(report.host, report.domains)
  );
  const urlNote =
    urlTotal > URL_IDENTIFIER_BATCH_LIMIT
      ? `showing ${URL_IDENTIFIER_BATCH_LIMIT} of ${urlTotal} URL(s)`
      : `${urlTotal} URL(s)`;
  const domainNote = identifierTruncationNote(
    domainTotal,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  const domainLabel = `${domainTotal} domain(s)${domainNote}`;
  return `URLScan search for ${report.host}: ${total}; ${urlNote}, ${domainLabel}`;
}

/** Pure interpret — past-scan URLs + domains as Identifiers when Entity set. */
export function interpretUrlscanLookupReport(
  report: UrlscanLookupSnapshot,
  opts: CapInterpretOpts<UrlscanInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...urlValuesBatch(report.urls, { limit: URL_IDENTIFIER_BATCH_LIMIT }),
      ...domainValuesBatch(withSeedHost(report.host, report.domains), {
        limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
      }),
    ],
    claimText: summarize(report),
    noEntitySummary: "URLScan search captured; no Entity to attach Identifiers",
  });
}
