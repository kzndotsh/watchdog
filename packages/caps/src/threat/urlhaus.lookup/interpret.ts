import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import type { IdentifierBatch } from "../../lib/collect/interpret-identifier-batches";
import {
  hashSeedBatch,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import type { urlhausLookupInput } from "./input";
import type { UrlhausLookupSnapshot } from "./report-schema";

type UrlhausInput = z.infer<typeof urlhausLookupInput>;

function summarize(report: UrlhausLookupSnapshot): string {
  if (!report.found) {
    return `URLhaus (abuse.ch) for ${report.query}: no hits`;
  }
  const parts: string[] = [];
  if (report.threat) parts.push(report.threat);
  if (report.urlStatus) parts.push(`status=${report.urlStatus}`);
  if (report.tags.length > 0) parts.push(report.tags.slice(0, 3).join(","));
  return `URLhaus (abuse.ch) for ${report.query}: ${parts.join("; ") || "listed"}`;
}

function hostSeedBatch(query: string): readonly IdentifierBatch[] {
  const asIp = querySeedBatches(query, "ip");
  if (asIp.length > 0) return asIp;
  return querySeedBatches(query, "domain");
}

function seedBatch(report: UrlhausLookupSnapshot): readonly IdentifierBatch[] {
  if (report.kind === "url") {
    return querySeedBatches(report.query, "url");
  }
  if (report.kind === "host") {
    return hostSeedBatch(report.query);
  }
  if (report.kind === "hash") {
    return hashSeedBatch(report.query);
  }
  return [];
}

/** Pure interpret — report is UrlhausLookupSnapshot JSON from run. */
export function interpretUrlhausLookupReport(
  report: UrlhausLookupSnapshot,
  opts: CapInterpretOpts<UrlhausInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: seedBatch(report),
    claimText: summarize(report),
    noEntitySummary: "URLhaus lookup captured; no Entity to attach Claim",
  });
}
