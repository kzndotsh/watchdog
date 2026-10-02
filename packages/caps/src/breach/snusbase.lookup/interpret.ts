import type { z } from "zod";

import type { SnusbaseLookupSnapshot } from "@watchdog/tools";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { snusbaseLookupInput } from "./input";

type SnusbaseInput = z.infer<typeof snusbaseLookupInput>;

const CLAIM_SAMPLE = 8;

function formatEntryLine(
  entry: SnusbaseLookupSnapshot["entries"][number]
): string {
  const parts: string[] = [`table=${entry.table}`];
  if (entry.email) parts.push(`email=${entry.email}`);
  if (entry.username) parts.push(`user=${entry.username}`);
  if (entry.password) parts.push(`password=${entry.password}`);
  if (entry.hash) parts.push(`hash=${entry.hash}`);
  if (entry.lastip) parts.push(`ip=${entry.lastip}`);
  if (entry.host) parts.push(`host=${entry.host}`);
  if (entry.domain) parts.push(`domain=${entry.domain}`);
  if (entry.name) parts.push(`name=${entry.name}`);
  return parts.join(" | ");
}

function summarize(report: SnusbaseLookupSnapshot): string {
  if (!report.found) {
    return `Snusbase for ${report.query}: no breach/combolist records`;
  }
  const top = report.tables
    .slice(0, 5)
    .map((t) => t.name)
    .join(", ");
  const tableBit = top ? `; tables: ${top}` : "";
  const lines = report.entries
    .slice(0, CLAIM_SAMPLE)
    .map(formatEntryLine)
    .filter((line) => line.length > 0);
  const sampleBit =
    lines.length > 0
      ? `\nSample (${lines.length}/${report.sampleCount} in Evidence):\n${lines.join("\n")}`
      : "";
  const more =
    report.total > report.sampleCount
      ? ` (${report.sampleCount} of ${report.total} stored in Evidence)`
      : "";
  return `Snusbase for ${report.query}: ${report.total} record(s)${more}${tableBit}.${sampleBit}`;
}

/** Pure interpret — report is SnusbaseLookupSnapshot JSON from run. */
export function interpretSnusbaseLookupReport(
  report: SnusbaseLookupSnapshot,
  opts: CapInterpretOpts<SnusbaseInput>
): CapInterpretResult {
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text: summarize(report),
    noEntitySummary: "Snusbase lookup captured; no Entity to attach Claim",
  });
}
