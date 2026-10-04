import type { z } from "zod";

import type { HttpProbeSnapshot } from "@watchdog/tools/http";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { httpProbeInput } from "./input";

type HttpInput = z.infer<typeof httpProbeInput>;

function summarize(snap: HttpProbeSnapshot): string {
  const headerKeys = Object.keys(snap.securityHeaders);
  const parts = [
    `status=${snap.status}`,
    `headers=${headerKeys.length ? headerKeys.join(",") : "none"}`,
    `security.txt=${snap.securityTxt.present ? "yes" : "no"}`,
    `favicon=${snap.favicon.sha256 ? snap.favicon.sha256.slice(0, 12) : "none"}`,
  ];
  if (snap.cdnHints.length) parts.push(`cdn=${snap.cdnHints.join(",")}`);
  if (snap.server) parts.push(`server=${snap.server}`);
  return parts.join("; ");
}

export function interpretHttpProbeReport(
  report: HttpProbeSnapshot,
  opts: CapInterpretOpts<HttpInput>
): CapInterpretResult {
  const text = `HTTP surface for ${report.host}: ${summarize(report)}`;
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text,
    noEntitySummary: "HTTP probe captured; no Entity to attach Claim",
  });
}
