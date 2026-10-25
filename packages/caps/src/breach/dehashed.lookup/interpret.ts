import type { z } from "zod";

import {
  describeCredential,
  describeReuse,
  type DehashedLookupSnapshot,
} from "@watchdog/tools/breach";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { dehashedLookupInput } from "./input";

type DehashedInput = z.infer<typeof dehashedLookupInput>;

const CLAIM_SAMPLE = 8;

function formatEntryLine(
  entry: DehashedLookupSnapshot["entries"][number]
): string {
  const parts: string[] = [];
  if (entry.databaseName) parts.push(`db=${entry.databaseName}`);
  if (entry.email) parts.push(`email=${entry.email}`);
  if (entry.username) parts.push(`user=${entry.username}`);
  if (entry.ipAddress) parts.push(`ip=${entry.ipAddress}`);
  // A Claim never quotes a credential, in either mode: only its kind and length.
  const password = describeCredential(entry.password, "plaintext");
  if (password !== null) parts.push(`password=${password}`);
  const hash = describeCredential(entry.hashedPassword, "hash");
  if (hash !== null) parts.push(`hash=${hash}`);
  if (entry.name) parts.push(`name=${entry.name}`);
  if (entry.phone) parts.push(`phone=${entry.phone}`);
  return parts.join(" | ");
}

function summarize(report: DehashedLookupSnapshot): string {
  if (!report.found) {
    return `DeHashed for ${report.query}: no breach records`;
  }
  const top = report.databases.slice(0, 5).join(", ");
  const dbBit = top ? `; databases: ${top}` : "";
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
  const reuse = describeReuse(report.reuse);
  const reuseBit = reuse.length > 0 ? `\nReuse: ${reuse.join("; ")}.` : "";
  return `DeHashed for ${report.query}: ${report.total} record(s)${more}${dbBit}.${sampleBit}${reuseBit}`;
}

/** Pure interpret — report is DehashedLookupSnapshot JSON from run. */
export function interpretDehashedLookupReport(
  report: DehashedLookupSnapshot,
  opts: CapInterpretOpts<DehashedInput>
): CapInterpretResult {
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text: summarize(report),
    noEntitySummary: "DeHashed lookup captured; no Entity to attach Claim",
  });
}
