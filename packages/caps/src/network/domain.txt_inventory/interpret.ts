import type { z } from "zod";

import type { TxtInventorySnapshot } from "@watchdog/tools/dns";

import { interpretObservationClaim } from "../../lib/collect/interpret-observation-claim";
import type { CapInterpretOpts, CapInterpretResult } from "../../sdk";
import type { txtInventoryInput } from "./input";

type TxtInput = z.infer<typeof txtInventoryInput>;

function summarize(snap: TxtInventorySnapshot): string {
  const verified = snap.tokens
    .filter(
      (t): t is typeof t & { product: string } =>
        t.kind === "verification" && typeof t.product === "string"
    )
    .map((t) => t.product);
  const unique = [...new Set(verified)];
  const parts: string[] = [`TXT=${snap.records.length}`];
  if (unique.length) parts.push(`SaaS=${unique.join(",")}`);
  const kinds = new Set(snap.tokens.map((t) => t.kind));
  if (kinds.has("spf")) parts.push("SPF");
  if (kinds.has("dmarc")) parts.push("DMARC");
  if (kinds.has("dkim")) parts.push("DKIM");
  return parts.join("; ");
}

/** Pure interpret — report is TxtInventorySnapshot JSON from run. */
export function interpretTxtInventoryReport(
  report: TxtInventorySnapshot,
  opts: CapInterpretOpts<TxtInput>
): CapInterpretResult {
  const text = `TXT inventory for ${report.host}: ${summarize(report)}`;
  return interpretObservationClaim({
    entityId: opts.input.entityId,
    text,
    noEntitySummary: "TXT inventory captured; no Entity to attach Claim",
  });
}
