import { Effect } from "effect";

import type { ToolsTag } from "../errors/tagged-errors";
import { Egress, type EgressApi } from "../http/egress";
import { nowIsoStringEffect } from "../infra/clock";
import {
  mailConfigSnapshotSchema,
  type MailConfigSnapshot,
} from "./mail-config-schema";
import { normalizeDnsLookupHostEffect } from "./resolve";

export { mailConfigSnapshotSchema, type MailConfigSnapshot };

/** Common DKIM selectors — posture probe, not exhaustive enumeration. */
const DEFAULT_DKIM_SELECTORS = [
  "default",
  "google",
  "selector1",
  "selector2",
  "k1",
  "s1",
  "s2",
  "mail",
  "dkim",
] as const;

function flattenTxt(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(""));
}

function resolveTxtFlatEffect(
  egress: EgressApi,
  name: string,
  signal: AbortSignal
): Effect.Effect<string[], ToolsTag> {
  return egress
    .resolve({ type: "TXT", name }, signal)
    .pipe(Effect.map((chunks) => flattenTxt(chunks)));
}

type MailConfigOptions = {
  dkimSelectors?: readonly string[];
};

/**
 * Collect MX + SPF/DMARC/DKIM posture via DNS only (passive).
 * DKIM uses a small fixed selector list — not a full selector hunt.
 */
export function fetchMailConfigEffect(
  host: string,
  signal: AbortSignal,
  options?: MailConfigOptions
): Effect.Effect<MailConfigSnapshot, ToolsTag, Egress> {
  return Effect.gen(function* fetchMailConfigGen() {
    const queriedAt = yield* nowIsoStringEffect;
    const normalizedHost = yield* normalizeDnsLookupHostEffect(host);
    const egress = yield* Egress;
    const selectors = options?.dkimSelectors ?? DEFAULT_DKIM_SELECTORS;
    const [mx, txtRoot, txtDmarc, ...dkimResults] = yield* Effect.all(
      [
        egress.resolve({ type: "MX", name: normalizedHost }, signal),
        resolveTxtFlatEffect(egress, normalizedHost, signal),
        resolveTxtFlatEffect(egress, `_dmarc.${normalizedHost}`, signal),
        ...selectors.map((selector) =>
          resolveTxtFlatEffect(
            egress,
            `${selector}._domainkey.${normalizedHost}`,
            signal
          ).pipe(
            Effect.map((records) => ({
              selector,
              present: records.some((r) => /v=DKIM1/i.test(r)),
              records,
            }))
          )
        ),
      ],
      { concurrency: "unbounded" }
    );

    const spfRecords = txtRoot.filter((r) => /v=spf1/i.test(r));
    const dmarcRecords = txtDmarc.filter((r) => /v=DMARC1/i.test(r));
    const found = dkimResults.filter((d) => d.present);

    const snap: MailConfigSnapshot = {
      host: normalizedHost,
      queriedAt,
      mx: mx
        .map((m) => ({ exchange: m.exchange, priority: m.priority }))
        .sort((a, b) => a.priority - b.priority),
      spf: { present: spfRecords.length > 0, records: spfRecords },
      dmarc: { present: dmarcRecords.length > 0, records: dmarcRecords },
      dkim: {
        selectorsTried: [...selectors],
        found,
      },
      txt: txtRoot,
    };
    return mailConfigSnapshotSchema.parse(snap);
  });
}
