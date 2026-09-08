import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { ipSeedBatch } from "../../lib/collect/query-seed-batches";
import type { ipLookupInput } from "./input";
import type { IpLookupSnapshot } from "./report-schema";

type IpLookupCapInput = z.infer<typeof ipLookupInput>;

function summarize(report: IpLookupSnapshot): string {
  const parts: string[] = [`IP ${report.ip}`];
  if (report.asns.length > 1) {
    parts.push(`ASNs=${report.asns.join(",")}`);
  } else if (report.asn) {
    parts.push(`ASN=${report.asn}`);
  }
  if (report.bgpPrefix) parts.push(`prefix=${report.bgpPrefix}`);
  if (report.asName) parts.push(`asName=${report.asName}`);
  if (report.countryCode) parts.push(`RIR CC=${report.countryCode}`);
  if (report.registry) parts.push(`registry=${report.registry}`);
  if (parts.length === 1) {
    return `IP ${report.ip}: no Cymru ASN data`;
  }
  return parts.join("; ");
}

/** Pure interpret — report is IpLookupSnapshot JSON from run. */
export function interpretIpLookupReport(
  report: IpLookupSnapshot,
  opts: CapInterpretOpts<IpLookupCapInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...ipSeedBatch(report.ip)],
    claimText: summarize(report),
    noEntitySummary: "IP lookup captured; no Entity to attach Identifiers",
  });
}
