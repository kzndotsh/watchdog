import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import {
  MissingCredentialError,
  ParseVendorError,
  ValidationVendorError,
  type ToolsTag,
} from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonUnknownEffect } from "../http/fetch-json";
import { recordRows } from "../parse/coerce";

export const hibpBreachSchema = z.object({
  name: z.string(),
  title: z.string().nullable(),
  domain: z.string().nullable(),
  breachDate: z.string().nullable(),
  pwnCount: z.number().int().nullable(),
  dataClasses: z.array(z.string()),
});

export const hibpLookupSnapshotSchema = z.object({
  email: z.string().min(1),
  queriedAt: z.string().min(1),
  found: z.boolean(),
  breachCount: z.number().int(),
  breaches: z.array(hibpBreachSchema),
  status: z.number().int().nullable(),
});

export type HibpBreach = z.infer<typeof hibpBreachSchema>;
export type HibpLookupSnapshot = z.infer<typeof hibpLookupSnapshotSchema>;

/**
 * HIBP breachedaccount (metadata only — no plaintext passwords).
 * Requires API key. Truncated list (max 40) for Proposal hygiene.
 */

interface HibpOptions {
  userAgent?: string;
  truncate?: number;
}

export function fetchHibpBreachedAccountEffect(
  email: string,
  apiKey: string,
  signal: AbortSignal,
  options?: HibpOptions
): Effect.Effect<HibpLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchHibpBreachedAccountGen() {
    const normalized = email.trim().toLowerCase();
    if (!normalized.includes("@")) {
      return yield* new ValidationVendorError({
        message: `Invalid email: ${email}`,
      });
    }
    const key = apiKey.trim();
    if (!key) {
      return yield* new MissingCredentialError({ slot: "HIBP_API_KEY" });
    }

    const ua = options?.userAgent ?? watchdogUserAgent("breach.hibp.lookup");
    const truncate = options?.truncate ?? 40;
    const url = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(normalized)}?truncateResponse=false`;

    const { status, body: raw } = yield* fetchJsonUnknownEffect({
      url,
      signal,
      service: "HIBP",
      subject: normalized,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: {
          "User-Agent": ua,
          "hibp-api-key": key,
          Accept: "application/json",
        },
      },
    });

    if (status === 404) {
      return hibpLookupSnapshotSchema.parse({
        email: normalized,
        queriedAt: new Date().toISOString(),
        found: false,
        breachCount: 0,
        breaches: [],
        status: 404,
      });
    }

    if (!Array.isArray(raw)) {
      return yield* new ParseVendorError({
        service: "HIBP",
        subject: normalized,
      });
    }

    const breaches: HibpBreach[] = recordRows(raw)
      .slice(0, truncate)
      .map((r) => {
        const dataClasses = Array.isArray(r.DataClasses)
          ? r.DataClasses.filter((x): x is string => typeof x === "string")
          : [];
        return hibpBreachSchema.parse({
          name: typeof r.Name === "string" ? r.Name : "unknown",
          title: typeof r.Title === "string" ? r.Title : null,
          domain: typeof r.Domain === "string" ? r.Domain : null,
          breachDate: typeof r.BreachDate === "string" ? r.BreachDate : null,
          pwnCount: typeof r.PwnCount === "number" ? r.PwnCount : null,
          dataClasses,
        });
      });

    return hibpLookupSnapshotSchema.parse({
      email: normalized,
      queriedAt: new Date().toISOString(),
      found: breaches.length > 0,
      breachCount: raw.length,
      breaches,
      status,
    });
  });
}
