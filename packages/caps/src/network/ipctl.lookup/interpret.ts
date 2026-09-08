import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  domainValuesBatch,
  ipSeedBatch,
} from "../../lib/collect/query-seed-batches";
import type { ipctlLookupInput } from "./input";
import type { IpctlLookupSnapshot } from "./report-schema";

type IpctlInput = z.infer<typeof ipctlLookupInput>;

interface SummaryPart {
  when: (report: IpctlLookupSnapshot) => boolean;
  format: (report: IpctlLookupSnapshot) => string;
}

const SUMMARY_PARTS: SummaryPart[] = [
  { when: (r) => r.asn !== null, format: (r) => `ASN=${r.asn}` },
  { when: (r) => Boolean(r.asName), format: (r) => `asName=${r.asName}` },
  {
    when: (r) => Boolean(r.bgpPrefix),
    format: (r) => `prefix=${r.bgpPrefix}`,
  },
  {
    when: (r) => Boolean(r.rirCountryCode),
    format: (r) => `RIR CC=${r.rirCountryCode}`,
  },
  { when: (r) => Boolean(r.rir), format: (r) => `registry=${r.rir}` },
  {
    when: (r) => Boolean(r.rpkiStatus),
    format: (r) => `RPKI=${r.rpkiStatus}`,
  },
  {
    when: (r) => Boolean(r.reverseDns),
    format: (r) => `PTR=${r.reverseDns}`,
  },
  {
    when: (r) => Boolean(r.geoCountryCode ?? r.geoCity ?? r.geoCountryName),
    format: (r) => {
      const geo = [r.geoCity, r.geoRegion, r.geoCountryName ?? r.geoCountryCode]
        .filter(Boolean)
        .join(", ");
      return `GeoIP≈${geo}`;
    },
  },
  {
    when: (r) => r.tags.length > 0,
    format: (r) => `tags=${r.tags.slice(0, 8).join(",")}`,
  },
  {
    when: (r) => r.threatScore !== null,
    format: (r) => `threat_score=${r.threatScore}`,
  },
];

function summarize(report: IpctlLookupSnapshot): string {
  const parts = [`IP ${report.ip}`];
  for (const part of SUMMARY_PARTS) {
    if (part.when(report)) parts.push(part.format(report));
  }
  if (parts.length === 1) return `IP ${report.ip}: no ipctl BGP data`;
  return parts.join("; ");
}

/** Pure interpret — seed ip + PTR domain when present. */
export function interpretIpctlLookupReport(
  report: IpctlLookupSnapshot,
  opts: CapInterpretOpts<IpctlInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...ipSeedBatch(report.ip),
      ...domainValuesBatch(report.reverseDns ? [report.reverseDns] : []),
    ],
    claimText: summarize(report),
    noEntitySummary: "ipctl lookup captured; no Entity to attach Claim",
  });
}
