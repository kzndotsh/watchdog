import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import {
  DOMAIN_IDENTIFIER_BATCH_LIMIT,
  domainValuesBatch,
  eligibleDomainCount,
  eligibleIpCount,
  identifierTruncationNote,
  ipValuesBatch,
  querySeedBatches,
} from "../../lib/collect/query-seed-batches";
import type { mnemonicLookupInput } from "./input";
import type { MnemonicLookupSnapshot } from "./report-schema";

type MnemonicInput = z.infer<typeof mnemonicLookupInput>;

function summarize(
  report: MnemonicLookupSnapshot,
  domainCount: number,
  ipCount: number
): string {
  const count =
    report.count === null
      ? `${report.records.length} record(s)`
      : `count≈${report.count}`;
  const domainNote = identifierTruncationNote(
    domainCount,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  const ipNote = identifierTruncationNote(
    ipCount,
    DOMAIN_IDENTIFIER_BATCH_LIMIT
  );
  if (report.kind === "ip") {
    const ipPart = ipCount > 0 ? `${ipCount} related IP(s)${ipNote}, ` : "";
    return `Mnemonic PDNS for IP ${report.query}: ${count}; ${ipPart}${domainCount} domain(s)${domainNote}`;
  }
  return `Mnemonic PDNS for ${report.query}: ${count}; ${ipCount} IP(s)${ipNote}, ${domainCount} related domain(s)${domainNote}`;
}

/** Pure interpret — report is MnemonicLookupSnapshot JSON from run. */
export function interpretMnemonicLookupReport(
  report: MnemonicLookupSnapshot,
  opts: CapInterpretOpts<MnemonicInput>
): CapInterpretResult {
  const domainValues =
    report.kind === "domain"
      ? report.domains.filter((value) => value !== report.query)
      : report.domains;
  const ipValues =
    report.kind === "ip"
      ? report.ips.filter((value) => value !== report.query)
      : report.ips;

  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [
      ...querySeedBatches(report.query, report.kind),
      ...domainValuesBatch(domainValues, {
        limit: DOMAIN_IDENTIFIER_BATCH_LIMIT,
      }),
      ...ipValuesBatch(ipValues, { limit: DOMAIN_IDENTIFIER_BATCH_LIMIT }),
    ],
    claimText: summarize(
      report,
      eligibleDomainCount(domainValues),
      eligibleIpCount(ipValues)
    ),
    noEntitySummary: "Mnemonic PDNS captured; no Entity to attach Identifiers",
  });
}
