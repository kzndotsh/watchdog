import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { UrlscanSubmitSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { urlSeedBatch } from "../../lib/collect/query-seed-batches";
import type { urlscanSubmitInput } from "./input";

type UrlscanSubmitInput = z.infer<typeof urlscanSubmitInput>;

function summarize(snap: UrlscanSubmitSnapshot): string {
  if (!snap.accepted) {
    return `urlscan.io submit for ${snap.url}: not accepted${snap.message ? ` (${snap.message})` : ""}`;
  }
  const link = snap.resultUrl ?? "no result link yet";
  return `urlscan.io submit for ${snap.url}: accepted (${snap.visibility}) — ${link}`;
}

/** Pure interpret — report is UrlscanSubmitSnapshot JSON from run. */
export function interpretUrlscanSubmitReport(
  report: UrlscanSubmitSnapshot,
  opts: CapInterpretOpts<UrlscanSubmitInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...urlSeedBatch(report.url)],
    claimText: summarize(report),
    noEntitySummary:
      "urlscan.io submit completed; no Entity to attach Identifiers",
  });
}
