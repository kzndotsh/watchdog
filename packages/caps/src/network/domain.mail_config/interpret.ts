import type { z } from "zod";

import type { MailConfigSnapshot } from "@watchdog/tools";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { mailConfigInput } from "./input";

type MailInput = z.infer<typeof mailConfigInput>;

function summarize(snap: MailConfigSnapshot): string {
  const parts: string[] = [];
  if (snap.mx.length) {
    parts.push(
      `MX=${snap.mx.map((m) => `${m.priority}:${m.exchange}`).join(",")}`
    );
  } else {
    parts.push("MX=none");
  }
  parts.push(
    snap.spf.present ? "SPF=yes" : "SPF=no",
    snap.dmarc.present ? "DMARC=yes" : "DMARC=no"
  );
  if (snap.dkim.found.length) {
    parts.push(`DKIM=${snap.dkim.found.map((d) => d.selector).join(",")}`);
  } else {
    parts.push("DKIM=none (common selectors)");
  }
  return parts.join("; ");
}

/** Pure interpret — report is MailConfigSnapshot JSON from run. */
export function interpretMailConfigReport(
  report: MailConfigSnapshot,
  opts: CapInterpretOpts<MailInput>
): CapInterpretResult {
  const text = `Mail config for ${report.host}: ${summarize(report)}`;
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text,
    noEntitySummary: "Mail config captured; no Entity to attach Claim",
  });
}
