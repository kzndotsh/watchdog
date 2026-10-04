import type { z } from "zod";

import type { WaybackLookupSnapshot } from "@watchdog/tools/wayback";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { urlSeedBatch } from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { waybackLookupInput } from "./input";

type Input = z.infer<typeof waybackLookupInput>;

export function interpretWaybackLookupReport(
  report: WaybackLookupSnapshot,
  opts: CapInterpretOpts<Input>
): CapInterpretResult {
  const text = `Wayback history for ${report.url}: ${report.rows.length} snapshot(s); closest=${report.closestTimestamp ?? "none"}`;
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...urlSeedBatch(report.url)],
    claimText: text,
    noEntitySummary:
      "Wayback history captured; no Entity to attach Identifiers",
  });
}
