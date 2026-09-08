import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { ArchiveSubmitSnapshot } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { urlSeedBatch } from "../../lib/collect/query-seed-batches";
import type { archiveUrlSubmitInput } from "./input";

type SubmitInput = z.infer<typeof archiveUrlSubmitInput>;

function summarize(snap: ArchiveSubmitSnapshot): string {
  const r = snap.results[0];
  if (!r) return `Archive submit for ${snap.url}: no result`;
  const urlBit = r.archiveUrl ?? "no archive URL";
  return `Archive submit for ${snap.url}: wayback accepted=${r.accepted} (${urlBit})`;
}

/** Pure interpret — report is ArchiveSubmitSnapshot JSON from run. */
export function interpretArchiveUrlSubmitReport(
  report: ArchiveSubmitSnapshot,
  opts: CapInterpretOpts<SubmitInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...urlSeedBatch(report.url)],
    claimText: summarize(report),
    noEntitySummary:
      "Archive submit completed; no Entity to attach Identifiers (public archive record may still exist)",
  });
}
