import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  domainValuesBatch,
  hashSeedBatch,
  ipValuesBatch,
  querySeedBatches,
  urlValuesBatch,
} from "../../lib/collect/query-seed-batches";
import { validatedIdentifierValue } from "../../lib/collect/validated-identifier-value";
import type { threatfoxLookupInput } from "./input";
import type { ThreatfoxLookupSnapshot } from "./report-schema";

type ThreatfoxInput = z.infer<typeof threatfoxLookupInput>;

const IOC_LIMIT = 40;

function stripPortFromIpIoc(raw: string): string {
  const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(raw);
  if (ipv4Port?.[1] !== undefined) return ipv4Port[1];
  const ipv6Port = /^\[(.+)\]:\d+$/.exec(raw);
  if (ipv6Port?.[1] !== undefined) return ipv6Port[1];
  return raw;
}

function iocKind(iocType: string | null): "ip" | "domain" | "url" | null {
  const kind = (iocType ?? "").toLowerCase();
  if (kind.includes("url")) return "url";
  if (kind.includes("domain") || kind === "fqdn") return "domain";
  if (kind.startsWith("ip") || kind === "ipv4" || kind === "ipv6") return "ip";
  return null;
}

function summarize(
  report: ThreatfoxLookupSnapshot,
  proposed: number,
  eligibleTotal: number
): string {
  if (!report.found) {
    return `ThreatFox (abuse.ch) for ${report.query}: no IOC hits`;
  }
  if (eligibleTotal === 0) {
    return `ThreatFox (abuse.ch) for ${report.query}: 0 IOC(s)`;
  }
  const top = report.iocs.slice(0, 3).map((i) => {
    const mal = i.malwarePrintable ?? i.malware ?? "?";
    return `${i.iocType ?? "ioc"}/${mal}`;
  });
  const shownNote =
    proposed < eligibleTotal
      ? `showing ${proposed} of ${eligibleTotal}`
      : `${eligibleTotal} IOC(s)`;
  return `ThreatFox (abuse.ch) for ${report.query}: ${shownNote} — ${top.join("; ")}`;
}

/** Pure interpret — report is ThreatfoxLookupSnapshot JSON from run. */
export function interpretThreatfoxLookupReport(
  report: ThreatfoxLookupSnapshot,
  opts: CapInterpretOpts<ThreatfoxInput>
): CapInterpretResult {
  const buckets = {
    ip: [] as string[],
    domain: [] as string[],
    url: [] as string[],
  };
  let collected = 0;
  let eligibleTotal = 0;
  for (const ioc of report.iocs) {
    const kind = iocKind(ioc.iocType);
    if (kind === null) continue;
    const value = kind === "ip" ? stripPortFromIpIoc(ioc.ioc) : ioc.ioc;
    if (value.trim() === "") continue;
    const normalized = validatedIdentifierValue(kind, value);
    if (normalized === null) continue;
    eligibleTotal += 1;
    if (collected >= IOC_LIMIT) continue;
    buckets[kind].push(normalized);
    collected += 1;
  }

  const result = interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...(report.kind === "other"
        ? hashSeedBatch(report.query)
        : querySeedBatches(report.query, report.kind)),
      ...ipValuesBatch(
        report.kind === "ip"
          ? buckets.ip.filter((value) => value !== report.query)
          : buckets.ip,
        { limit: IOC_LIMIT }
      ),
      ...domainValuesBatch(
        report.kind === "domain"
          ? buckets.domain.filter((value) => value !== report.query)
          : buckets.domain,
        { limit: IOC_LIMIT }
      ),
      ...urlValuesBatch(buckets.url, { limit: IOC_LIMIT }),
    ],
    claimText: summarize(report, collected, eligibleTotal),
    noEntitySummary: "ThreatFox lookup captured; no Entity to attach Claim",
  });

  return result;
}
