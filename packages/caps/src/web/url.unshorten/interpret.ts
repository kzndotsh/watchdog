import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { UnshortenSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  URL_IDENTIFIER_BATCH_LIMIT,
  eligibleUrlCount,
  identifierTruncationNote,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import type { urlUnshortenInput } from "./input";

type Input = z.infer<typeof urlUnshortenInput>;

export function interpretUnshortenReport(
  report: UnshortenSnapshot,
  opts: CapInterpretOpts<Input>
): CapInterpretResult {
  const urlCandidates = [
    report.url,
    report.finalUrl,
    ...report.chain.map((hop) => hop.url),
  ];
  const urlTotal = eligibleUrlCount(urlCandidates);
  const urlNote = identifierTruncationNote(
    urlTotal,
    URL_IDENTIFIER_BATCH_LIMIT
  );
  const text = `Unshorten ${report.url} → ${report.finalUrl} (${report.hopCount} hop(s))${urlNote}`;
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...urlValuesBatch(urlCandidates, { limit: URL_IDENTIFIER_BATCH_LIMIT }),
    ],
    claimText: text,
    noEntitySummary: "Unshorten captured; no Entity to attach Claim",
  });
}
