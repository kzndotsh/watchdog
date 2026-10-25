import type { z } from "zod";

import type { LeakradarLookupSnapshot } from "@watchdog/tools/breach";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { leakradarLookupInput } from "./input";

type LeakradarInput = z.infer<typeof leakradarLookupInput>;

const TOP_HOSTS = 5;

/** Said in every Claim: a hit is a record in an index, not proof the person controls the account. */
const CAVEAT =
  "A hit shows a record exists in LeakRadar's index, not that the person controls the account.";

function newestAdded(report: LeakradarLookupSnapshot): string | null {
  let newest: string | null = null;
  let newestMs = Number.NEGATIVE_INFINITY;
  for (const record of report.records) {
    const ms =
      record.addedAt === null ? Number.NaN : Date.parse(record.addedAt);
    if (!Number.isNaN(ms) && ms > newestMs) {
      newestMs = ms;
      newest = record.addedAt;
    }
  }
  return newest;
}

function topHosts(report: LeakradarLookupSnapshot): string {
  const counts = new Map<string, number>();
  for (const record of report.records) {
    if (record.host === null) continue;
    counts.set(record.host, (counts.get(record.host) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, TOP_HOSTS)
    .map(([host, n]) => `${host} (${n})`)
    .join(", ");
}

function summarize(report: LeakradarLookupSnapshot): string {
  const head = `LeakRadar (masked, nothing unlocked) for ${report.query}`;
  if (!report.found) return `${head}: no matching records`;
  const parts: string[] = [];
  const counts = report.domainCounts;
  if (counts === null) {
    parts.push(`${report.total} record(s)`);
  } else if (counts.approximate === true) {
    // The summary is a sample: its counts and the listing's total are two statements.
    parts.push(
      `about ${report.total} account(s) on this domain (estimate: ${counts.employees} employee, ${counts.thirdParties} third-party, ${counts.customers} customer)`
    );
  } else {
    parts.push(
      `${report.total} account(s): ${counts.employees} employee, ${counts.thirdParties} third-party, ${counts.customers} customer`
    );
  }
  if (report.listed) {
    if (counts !== null && report.listingTotal !== null) {
      parts.push(`${report.listingTotal} listed`);
    }
    const more = report.isTruncated ? `, more beyond page ${report.page}` : "";
    parts.push(`${report.records.length} masked record(s) read${more}`);
    const newest = newestAdded(report);
    if (newest !== null) parts.push(`most recent added ${newest}`);
    const hosts = topHosts(report);
    if (hosts !== "") parts.push(`source hosts: ${hosts}`);
  }
  return `${head}: ${parts.join("; ")}. ${CAVEAT}`;
}

/** Pure interpret: report is LeakradarLookupSnapshot JSON from run. One observation Claim, no Graph write. */
export function interpretLeakradarLookupReport(
  report: LeakradarLookupSnapshot,
  opts: CapInterpretOpts<LeakradarInput>
): CapInterpretResult {
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text: summarize(report),
    noEntitySummary: "LeakRadar lookup captured; no Entity to attach Claim",
  });
}
