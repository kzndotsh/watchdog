import type { z } from "zod";

import type { CapInterpretOpts, CapInterpretResult } from "@watchdog/cap-sdk";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { emailrepLookupInput } from "./input";
import type { EmailrepLookupSnapshot } from "./report-schema";

type EmailrepInput = z.infer<typeof emailrepLookupInput>;

function summarize(report: EmailrepLookupSnapshot): string {
  if (!report.found) {
    return `EmailRep: ${report.email}: no record`;
  }
  const parts: string[] = [`Email ${report.email}`];
  if (report.reputation) parts.push(`reputation=${report.reputation}`);
  if (report.suspicious) parts.push("suspicious");
  if (report.references !== null) parts.push(`references=${report.references}`);
  if (report.credentialsLeaked) parts.push("credentials_leaked");
  if (report.maliciousActivity) parts.push("malicious_activity");
  if (report.dataBreach) parts.push("data_breach");
  if (report.profiles.length > 0) {
    parts.push(`profiles=${report.profiles.slice(0, 8).join(",")}`);
  }
  if (report.disposable) parts.push("disposable");
  if (report.firstSeen) parts.push(`firstSeen=${report.firstSeen}`);
  if (report.lastSeen) parts.push(`lastSeen=${report.lastSeen}`);
  return `EmailRep: ${parts.join("; ")}`;
}

/** Pure interpret — seed email Identifier; flags and dates stay on the Claim. */
export function interpretEmailrepLookupReport(
  report: EmailrepLookupSnapshot,
  opts: CapInterpretOpts<EmailrepInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.email, "email")],
    claimText: summarize(report),
    noEntitySummary: "EmailRep lookup captured; no Entity to attach Claim",
  });
}
