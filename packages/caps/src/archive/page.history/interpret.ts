import type { z } from "zod";

import type { WaybackHistorySnapshot } from "@watchdog/tools/wayback";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { urlSeedBatch } from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { pageHistoryInput } from "./input";

type Input = z.infer<typeof pageHistoryInput>;

/** `20190612101500` as `2019-06-12`. */
function day(timestamp: string): string {
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

/** One line for the Claim and the Proposal summary; the details stay in the report. */
export function describePageHistory(report: WaybackHistorySnapshot): string {
  const { versions } = report;
  const first = versions[0];
  const last = versions.at(-1);
  if (first === undefined || last === undefined) {
    return "no archived versions";
  }
  const titleChanges = versions.filter((v) => v.change?.titleChanged).length;
  const parts = [
    `${plural(versions.length, "distinct version")} between ${day(first.timestamp)} and ${day(last.timestamp)}`,
  ];
  if (titleChanges > 0) parts.push(plural(titleChanges, "title change"));
  if (report.totalCaptures !== null) {
    const open = report.totalCapturesIsLowerBound ? "+" : "";
    parts.push(`from ${report.totalCaptures}${open} captures`);
  }
  if (report.failed.length > 0) {
    parts.push(`${report.failed.length} not fetched`);
  }
  if (report.isTruncated) parts.push("more versions available");
  return parts.join("; ");
}

/**
 * Evidence is the versions themselves (each one an artifact), so the Proposal is only the URL
 * Identifier and one Claim that the page changed between those dates.
 */
export function interpretPageHistoryReport(
  report: WaybackHistorySnapshot,
  opts: CapInterpretOpts<Input>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...urlSeedBatch(report.url)],
    claimText: `Wayback page history for ${report.url}: ${describePageHistory(report)}`,
    noEntitySummary:
      "Wayback page history captured; no Entity to attach Identifiers",
  });
}
