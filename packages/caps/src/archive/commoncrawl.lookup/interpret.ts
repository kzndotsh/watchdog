import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  identifierTruncationNote,
  querySeedBatches,
  URL_IDENTIFIER_BATCH_LIMIT,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { commoncrawlLookupInput } from "./input";
import type { CommoncrawlLookupSnapshot } from "./report-schema";

type CcInput = z.infer<typeof commoncrawlLookupInput>;

function summarize(report: CommoncrawlLookupSnapshot): string {
  const urlTotal = report.urls.length;
  const urlNote = identifierTruncationNote(
    urlTotal,
    URL_IDENTIFIER_BATCH_LIMIT
  );
  return `Common Crawl for ${report.host}: ${urlTotal} URL(s)${urlNote} across ${report.indexes.join(", ") || "no indexes"}`;
}

/** Pure interpret — crawl URLs as url Identifiers when Entity set. */
export function interpretCommoncrawlLookupReport(
  report: CommoncrawlLookupSnapshot,
  opts: CapInterpretOpts<CcInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...querySeedBatches(report.host, "domain"),
      ...urlValuesBatch(report.urls, { limit: URL_IDENTIFIER_BATCH_LIMIT }),
    ],
    claimText: summarize(report),
    noEntitySummary:
      "Common Crawl lookup captured; no Entity to attach Identifiers",
  });
}
