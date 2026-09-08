import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  identifierTruncationNote,
  ipSeedBatch,
} from "../../lib/collect/query-seed-batches";
import type { hackertargetLookupInput } from "./input";
import type { HackertargetLookupSnapshot } from "./report-schema";

type HtInput = z.infer<typeof hackertargetLookupInput>;

function summarize(report: HackertargetLookupSnapshot): string {
  const err = report.error ? `; error=${report.error}` : "";
  const eligibleHosts = eligibleDomainCount(report.domains);
  const hostNote = identifierTruncationNote(
    eligibleHosts,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  return `HackerTarget reverse-IP for ${report.ip}: ${eligibleHosts} host(s)${hostNote}${err}`;
}

/** Pure interpret — co-hosted hostnames as domain Identifiers when Entity set. */
export function interpretHackertargetLookupReport(
  report: HackertargetLookupSnapshot,
  opts: CapInterpretOpts<HtInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...ipSeedBatch(report.ip),
      ...domainValuesBatch(report.domains, {
        limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
      }),
    ],
    claimText: summarize(report),
    noEntitySummary:
      "HackerTarget reverse-IP captured; no Entity to attach Identifiers",
  });
}
