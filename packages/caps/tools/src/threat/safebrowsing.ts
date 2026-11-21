import { z } from "zod";

import { ValidationVendorError } from "../errors/tagged-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import {
  assertHttpUrlScheme,
  normalizeHttpUrl,
} from "../http/normalize-http-url";
import { isRecord } from "../parse/coerce";

export const safebrowsingMatchSchema = z.object({
  threatType: z.string(),
  platformType: z.string(),
});

export const safebrowsingLookupSnapshotSchema = z.object({
  url: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("safebrowsing.googleapis.com"),
  found: z.boolean(),
  matches: z.array(safebrowsingMatchSchema),
});

export type SafebrowsingMatch = z.infer<typeof safebrowsingMatchSchema>;
export type SafebrowsingLookupSnapshot = z.infer<
  typeof safebrowsingLookupSnapshotSchema
>;

const THREAT_TYPES = [
  "MALWARE",
  "SOCIAL_ENGINEERING",
  "UNWANTED_SOFTWARE",
  "POTENTIALLY_HARMFUL_APPLICATION",
];

/**
 * Google Safe Browsing v4 `threatMatches.find` — URL threat-list membership.
 * POST https://safebrowsing.googleapis.com/v4/threatMatches:find?key=…
 * @see https://developers.google.com/safe-browsing/v4/lookup-api
 */

type SafebrowsingOptions = {
  userAgent: string;
};

export const fetchSafebrowsingLookupEffect = defineJsonProvider({
  service: "Safe Browsing",
  schema: safebrowsingLookupSnapshotSchema,
  key: { query: "key" },
  normalize: (raw) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new ValidationVendorError({ message: "url required" });
    }
    assertHttpUrlScheme(trimmed);
    return normalizeHttpUrl(trimmed);
  },
  request: (url, _options: SafebrowsingOptions) => ({
    url: "https://safebrowsing.googleapis.com/v4/threatMatches:find",
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client: { clientId: "watchdog", clientVersion: "1.0" },
      threatInfo: {
        threatTypes: THREAT_TYPES,
        platformTypes: ["ANY_PLATFORM"],
        threatEntryTypes: ["URL"],
        threatEntries: [{ url }],
      },
    }),
  }),
  toSnapshot: ({ subject: url, queriedAt, body }) => {
    const rawMatches = Array.isArray(body.matches) ? body.matches : [];
    const matches: SafebrowsingMatch[] = [];
    for (const row of rawMatches) {
      if (!isRecord(row)) continue;
      if (
        typeof row.threatType !== "string" ||
        typeof row.platformType !== "string"
      ) {
        continue;
      }
      matches.push({
        threatType: row.threatType,
        platformType: row.platformType,
      });
    }
    return {
      url,
      queriedAt,
      source: "safebrowsing.googleapis.com" as const,
      found: matches.length > 0,
      matches,
    };
  },
});
