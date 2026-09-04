import type { Resolver } from "node:dns/promises";

import { Effect } from "effect";

import type { ToolsTag } from "../errors/tagged-errors";
import { dnsOrEmpty, runAbortableResolver } from "./abortable-resolver";
import {
  mailConfigSnapshotSchema,
  type MailConfigSnapshot,
} from "./mail-config-schema";

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
  resolver: Resolver,
  name: string
): Effect.Effect<string[]> {
  return dnsOrEmpty(() => resolver.resolveTxt(name), [] as string[][]).pipe(
    Effect.map((chunks) => flattenTxt(chunks))
  );
}

interface MailConfigOptions {
  dkimSelectors?: readonly string[];
}

/**
 * Collect MX + SPF/DMARC/DKIM posture via DNS only (passive).
 * DKIM uses a small fixed selector list — not a full selector hunt.
 */
export function fetchMailConfigEffect(
  host: string,
  signal: AbortSignal,
  options?: MailConfigOptions
): Effect.Effect<MailConfigSnapshot, ToolsTag> {
  return runAbortableResolver(
    signal,
    "Mail config lookup aborted",
    (resolver) =>
      Effect.gen(function* fetchMailConfigGen() {
        const selectors = options?.dkimSelectors ?? DEFAULT_DKIM_SELECTORS;
        const [mx, txtRoot, txtDmarc, ...dkimResults] = yield* Effect.all(
          [
            dnsOrEmpty(
              () => resolver.resolveMx(host),
              [] as { exchange: string; priority: number }[]
            ),
            resolveTxtFlatEffect(resolver, host),
            resolveTxtFlatEffect(resolver, `_dmarc.${host}`),
            ...selectors.map((selector) =>
              resolveTxtFlatEffect(
                resolver,
                `${selector}._domainkey.${host}`
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
          host,
          queriedAt: new Date().toISOString(),
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
      })
  );
}
