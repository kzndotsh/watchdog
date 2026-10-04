import type { z } from "zod";

import type { WhoisSnapshot } from "@watchdog/tools/whois";

import { interpretWhoisSnapshot } from "../../lib/collect/interpret-whois-snapshot";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { whoisXmlLookupInput } from "./input";

type WhoisXmlInput = z.infer<typeof whoisXmlLookupInput>;

/** Pure interpret — report is WhoisSnapshot JSON from run. */
export function interpretWhoisXmlReport(
  report: WhoisSnapshot,
  opts: CapInterpretOpts<WhoisXmlInput>
): CapInterpretResult {
  return interpretWhoisSnapshot({
    report,
    entityId: opts.input.entityId,
    claimLabel: "WhoisXML",
    noEntitySummary: "WhoisXML captured; no Entity to attach",
  });
}
