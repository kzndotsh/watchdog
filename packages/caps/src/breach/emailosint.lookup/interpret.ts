import type { z } from "zod";

import type { EmailosintLookupSnapshot } from "@watchdog/tools/breach";

import { interpretIdentifierBatches } from "../../lib/collect/interpret-identifier-batches";
import { querySeedBatches } from "../../lib/collect/query-seed-batches";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { emailosintLookupInput } from "./input";

type EmailosintInput = z.infer<typeof emailosintLookupInput>;

const MAX_LISTED = 12;

function listed(names: readonly string[], total: number): string {
  const shown = names.slice(0, MAX_LISTED);
  const more = total > shown.length ? ` (+${total - shown.length} more)` : "";
  return `${shown.join(", ")}${more}`;
}

function summarize(report: EmailosintLookupSnapshot): string {
  const parts: string[] = [];
  const services = [
    ...new Set([
      ...report.accounts.map((a) => a.serviceName ?? a.service),
      ...report.registeredOn,
    ]),
  ];
  if (services.length > 0) {
    parts.push(`registered on ${listed(services, services.length)}`);
  }
  if (report.breachTotal !== null && report.breachTotal > 0) {
    const names = report.breachSources.map((s) =>
      s.date === null ? s.name : `${s.name} (${s.date})`
    );
    const sourceTotal = report.breachSourceCount ?? names.length;
    parts.push(
      `${report.breachTotal} breach record(s) from ${sourceTotal} source(s)${names.length > 0 ? `: ${listed(names, sourceTotal)}` : ""}`
    );
  }
  if (report.stealerLogCount !== null && report.stealerLogCount > 0) {
    parts.push(`${report.stealerLogCount} infostealer log(s)`);
  }
  if (parts.length === 0) parts.push("no accounts or exposure reported");
  if (report.timedOut || !report.completed) parts.push("partial result");
  if (report.isTruncated) parts.push("lists truncated");
  return `EmailOSINT for ${report.email}: ${parts.join("; ")}`;
}

/** Pure interpret: seed email Identifier; services and exposure stay on the Claim. */
export function interpretEmailosintLookupReport(
  report: EmailosintLookupSnapshot,
  opts: CapInterpretOpts<EmailosintInput>
): CapInterpretResult {
  return interpretIdentifierBatches({
    entityId: opts.input.entityId,
    batches: [...querySeedBatches(report.email, "email")],
    claimText: summarize(report),
    noEntitySummary: "EmailOSINT lookup completed; no Entity to attach Claim",
  });
}
