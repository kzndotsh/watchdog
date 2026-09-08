import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { hashSeedBatch } from "../../lib/collect/query-seed-batches";
import type { hashlookupLookupInput } from "./input";
import type { HashlookupSnapshot } from "./report-schema";

type HashlookupInput = z.infer<typeof hashlookupLookupInput>;

function summarize(report: HashlookupSnapshot): string {
  if (!report.found) {
    return `CIRCL hashlookup for ${report.hash}: not a known file`;
  }
  const name = report.fileName ?? "unnamed file";
  const product = report.product ? ` (${report.product})` : "";
  const trust = report.trust === null ? "" : `, trust=${report.trust}`;
  const extra = [report.md5, report.sha1, report.sha256].filter(Boolean);
  const extraBit = extra.length > 0 ? `; hashes=${extra.join(",")}` : "";
  return `CIRCL hashlookup for ${report.hash}: known file — ${name}${product}${trust}${extraBit}`;
}

/** Pure interpret — report is HashlookupSnapshot JSON from run. */
export function interpretHashlookupLookupReport(
  report: HashlookupSnapshot,
  opts: CapInterpretOpts<HashlookupInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: hashSeedBatch(report.hash),
    claimText: summarize(report),
    noEntitySummary:
      "CIRCL hashlookup captured; no Entity to attach Identifiers",
  });
}
