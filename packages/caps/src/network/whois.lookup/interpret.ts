import type { z } from "zod";

import type { WhoisSnapshot } from "@watchdog/tools/whois";

import { interpretWhoisSnapshot } from "../../lib/collect/interpret-whois-snapshot";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { whoisLookupInput } from "./input";

type WhoisInput = z.infer<typeof whoisLookupInput>;

/** Pure interpret — report is WhoisSnapshot JSON from run. */
export function interpretWhoisReport(
  report: WhoisSnapshot,
  opts: CapInterpretOpts<WhoisInput>
): CapInterpretResult {
  return interpretWhoisSnapshot({
    report,
    entityId: opts.input.entityId,
    claimLabel: "WHOIS",
    noEntitySummary: "WHOIS captured; no Entity to attach",
  });
}
