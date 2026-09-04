import { Effect } from "effect";
import { z } from "zod";

import { dnsOrEmpty, runAbortableResolver } from "../dns/abortable-resolver";
import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { validationToolsError } from "../errors/tools-error";

export const emailLookupSnapshotSchema = z.object({
  email: z.string().min(1),
  domain: z.string().min(1),
  queriedAt: z.string().min(1),
  providerHint: z.string().nullable(),
  mx: z.array(
    z.object({
      exchange: z.string(),
      priority: z.number(),
    })
  ),
  spfPresent: z.boolean(),
  dmarcPresent: z.boolean(),
});

export type EmailLookupSnapshot = z.infer<typeof emailLookupSnapshotSchema>;

const PROVIDER_BY_DOMAIN: Record<string, string> = {
  "gmail.com": "google",
  "googlemail.com": "google",
  "outlook.com": "microsoft",
  "hotmail.com": "microsoft",
  "live.com": "microsoft",
  "msn.com": "microsoft",
  "yahoo.com": "yahoo",
  "ymail.com": "yahoo",
  "icloud.com": "apple",
  "me.com": "apple",
  "mac.com": "apple",
  "proton.me": "proton",
  "protonmail.com": "proton",
  "pm.me": "proton",
  "fastmail.com": "fastmail",
  "fastmail.fm": "fastmail",
  "tutanota.com": "tutanota",
  "tuta.io": "tutanota",
};

const PROVIDER_BY_MX: readonly { needle: string; provider: string }[] = [
  { needle: "google.com", provider: "google" },
  { needle: "googlemail.com", provider: "google" },
  { needle: "outlook.com", provider: "microsoft" },
  { needle: "protection.outlook.com", provider: "microsoft" },
  { needle: "yahoodns.net", provider: "yahoo" },
  { needle: "protonmail.ch", provider: "proton" },
  { needle: "messagingengine.com", provider: "fastmail" },
  { needle: "tutanota.de", provider: "tutanota" },
];

/** Normalize email → lowercase local@domain; throws if shape is wrong. */
export function normalizeEmail(raw: string): { email: string; domain: string } {
  const trimmed = raw.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) {
    throw validationToolsError(`Invalid email: ${raw}`);
  }
  const domain = trimmed.slice(at + 1);
  if (!domain.includes(".") || domain.includes(" ")) {
    throw validationToolsError(`Invalid email domain: ${raw}`);
  }
  return { email: trimmed, domain };
}

function flatTxt(chunks: string[][]): string[] {
  return chunks.map((parts) => parts.join(""));
}

function providerHint(domain: string, mxExchanges: string[]): string | null {
  const byDomain = PROVIDER_BY_DOMAIN[domain];
  if (byDomain !== undefined) return byDomain;
  const joined = mxExchanges.join(" ").toLowerCase();
  for (const { needle, provider } of PROVIDER_BY_MX) {
    if (joined.includes(needle)) return provider;
  }
  return null;
}

/**
 * Email-seed pivot: MX + SPF/DMARC presence + provider hint for the mailbox domain.
 * Distinct from network.domain.mail_config (host seed, fuller DKIM posture).
 */
export function fetchEmailLookupEffect(
  emailRaw: string,
  signal: AbortSignal
): Effect.Effect<EmailLookupSnapshot, ToolsTag> {
  return Effect.gen(function* fetchEmailLookupGen() {
    const { email, domain } = yield* Effect.try({
      try: () => normalizeEmail(emailRaw),
      catch: mapToolsCatch,
    });
    return yield* runAbortableResolver(
      signal,
      "Email lookup aborted",
      (resolver) =>
        Effect.gen(function* fetchEmailDnsGen() {
          const [mx, txtRoot, txtDmarc] = yield* Effect.all(
            [
              dnsOrEmpty(
                () => resolver.resolveMx(domain),
                [] as { exchange: string; priority: number }[]
              ),
              dnsOrEmpty(() => resolver.resolveTxt(domain), [] as string[][]),
              dnsOrEmpty(
                () => resolver.resolveTxt(`_dmarc.${domain}`),
                [] as string[][]
              ),
            ],
            { concurrency: "unbounded" }
          );

          const root = flatTxt(txtRoot);
          const dmarc = flatTxt(txtDmarc);
          const mxSorted = mx
            .map((m) => ({ exchange: m.exchange, priority: m.priority }))
            .sort((a, b) => a.priority - b.priority);

          return emailLookupSnapshotSchema.parse({
            email,
            domain,
            queriedAt: new Date().toISOString(),
            providerHint: providerHint(
              domain,
              mxSorted.map((m) => m.exchange)
            ),
            mx: mxSorted,
            spfPresent: root.some((r) => /v=spf1/i.test(r)),
            dmarcPresent: dmarc.some((r) => /v=DMARC1/i.test(r)),
          });
        })
    );
  });
}
