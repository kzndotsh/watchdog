import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import {
  MissingCredentialError,
  ValidationVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
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

interface SafebrowsingOptions {
  userAgent?: string;
}

export function fetchSafebrowsingLookupEffect(
  urlRaw: string,
  apiKey: string,
  signal: AbortSignal,
  options?: SafebrowsingOptions
): Effect.Effect<SafebrowsingLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchSafebrowsingLookupGen() {
    const url = urlRaw.trim();
    if (!url) {
      return yield* new ValidationVendorError({ message: "url required" });
    }
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({
        slot: "GOOGLE_SAFEBROWSING_API_KEY",
      });
    }

    const ua =
      options?.userAgent ?? watchdogUserAgent("threat.safebrowsing.lookup");

    const { body } = yield* fetchJsonObjectEffect({
      url: `https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`,
      signal,
      service: "Safe Browsing",
      subject: url,
      init: {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": ua,
        },
        body: JSON.stringify({
          client: { clientId: "watchdog", clientVersion: "1.0" },
          threatInfo: {
            threatTypes: THREAT_TYPES,
            platformTypes: ["ANY_PLATFORM"],
            threatEntryTypes: ["URL"],
            threatEntries: [{ url }],
          },
        }),
      },
    });
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

    return safebrowsingLookupSnapshotSchema.parse({
      url,
      queriedAt: new Date().toISOString(),
      source: "safebrowsing.googleapis.com",
      found: matches.length > 0,
      matches,
    });
  });
}
