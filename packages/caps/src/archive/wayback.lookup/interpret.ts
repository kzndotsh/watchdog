import type { z } from "zod";

import type { WaybackLookupSnapshot } from "@watchdog/tools/wayback";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { urlSeedBatch } from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { waybackLookupInput } from "./input";

type Input = z.infer<typeof waybackLookupInput>;

function count(n: number, noun: string, open: boolean): string {
  return `${n}${open ? "+" : ""} ${noun}${n === 1 && !open ? "" : "s"}`;
}

/** "37 captures, 6 distinct versions"; a `+` and "more available" mark a count that is cut. */
export function describeWaybackLookup(report: WaybackLookupSnapshot): string {
  const versions = count(
    report.distinctVersions,
    "distinct version",
    report.isTruncated
  );
  if (report.totalCaptures === null) {
    return `${versions} (capture count unavailable)`;
  }
  const captures = count(
    report.totalCaptures,
    "capture",
    report.totalCapturesIsLowerBound
  );
  return `${captures}, ${versions}${report.isTruncated ? "; more available" : ""}`;
}

export function interpretWaybackLookupReport(
  report: WaybackLookupSnapshot,
  opts: CapInterpretOpts<Input>
): CapInterpretResult {
  const text = `Wayback history for ${report.url}: ${describeWaybackLookup(report)}; closest=${report.closestTimestamp ?? "none"}`;
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...urlSeedBatch(report.url)],
    claimText: text,
    noEntitySummary:
      "Wayback history captured; no Entity to attach Identifiers",
  });
}
