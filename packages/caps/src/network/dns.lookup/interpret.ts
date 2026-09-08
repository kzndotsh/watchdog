import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { DnsRecords } from "@watchdog/tools";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  eligibleIpCount,
  identifierTruncationNote,
  ipValuesBatch,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import type { dnsLookupInput } from "./input";

type DnsInput = z.infer<typeof dnsLookupInput>;

function summarize(snap: DnsRecords): string {
  const ips = [...snap.a, ...snap.aaaa];
  const ipTotal = eligibleIpCount(ips);
  const ipNote = identifierTruncationNote(
    ipTotal,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  const parts: string[] = [];
  if (ipTotal > 0) {
    if (ipNote === "") {
      const eligible = ipValuesBatch(ips)[0]?.values ?? [];
      if (eligible.length > 0) {
        parts.push(`IP=${eligible.join(",")}`);
      }
    } else {
      parts.push(`${ipTotal} IP address(es)${ipNote}`);
    }
  }
  if (snap.mx.length) {
    parts.push(
      `MX=${snap.mx.map((m) => `${m.priority}:${m.exchange}`).join(",")}`
    );
  }
  if (snap.ns.length) parts.push(`NS=${snap.ns.join(",")}`);
  return parts.length ? parts.join("; ") : "no records";
}

/** Pure interpret — A/AAAA as ip Identifiers; NS/MX stay in the Claim. */
export function interpretDnsReport(
  report: DnsRecords,
  opts: CapInterpretOpts<DnsInput>
): CapInterpretResult {
  const text = `DNS for ${report.host}: ${summarize(report)}`;
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...querySeedBatches(report.host, "domain"),
      ...ipValuesBatch([...report.a, ...report.aaaa], {
        limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
      }),
    ],
    claimText: text,
    noEntitySummary: "DNS captured; no Entity to attach Identifiers",
  });
}
