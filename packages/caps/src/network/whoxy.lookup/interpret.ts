import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";
import type { WhoisSnapshot } from "@watchdog/tools";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import { interpretWhoisSnapshot } from "../../lib/collect/interpret-whois-snapshot";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { whoxyLookupInput } from "./input";
import type { WhoxyLookupSnapshot } from "./report-schema";

type WhoxyInput = z.infer<typeof whoxyLookupInput>;

function toWhoisSnapshot(report: WhoxyLookupSnapshot): WhoisSnapshot {
  return {
    host: report.host,
    source: "whoxy",
    registrar: report.registrarName ?? report.domainRegistrar,
    registrantOrg: report.registrantOrg,
    nameservers: report.nameServers,
    status: [],
    registeredAt: report.createDate,
    expiresAt: report.expireDate,
    raw: report.rawStatus,
  };
}

const NO_ENTITY = "Whoxy lookup captured; no Entity to attach Claim";

/** Pure interpret — report is WhoxyLookupSnapshot JSON from run. */
export function interpretWhoxyLookupReport(
  report: WhoxyLookupSnapshot,
  opts: CapInterpretOpts<WhoxyInput>
): CapInterpretResult {
  if (!report.ok) {
    return interpretObservationClaim({
      entityId: opts.input.entityId,
      text: `Whoxy for ${report.host}: no WHOIS record`,
      noEntitySummary: NO_ENTITY,
    });
  }

  return interpretWhoisSnapshot({
    report: toWhoisSnapshot(report),
    entityId: opts.input.entityId,
    claimLabel: "Whoxy",
    noEntitySummary: NO_ENTITY,
    extraBatches: [
      ...querySeedBatches(report.host, "domain"),
      ...(report.registrantEmail
        ? querySeedBatches(report.registrantEmail, "email")
        : []),
    ],
  });
}
