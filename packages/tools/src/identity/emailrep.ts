import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import { ValidationVendorError, type ToolsTag } from "../errors/tagged-errors";
import { parseToolsError } from "../errors/tools-error";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asBool, asNumber, asString, isRecord } from "../parse/coerce";

export const emailrepLookupSnapshotSchema = z.object({
  email: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("emailrep.io"),
  found: z.boolean(),
  reputation: z.string().nullable(),
  suspicious: z.boolean(),
  references: z.number().int().nullable(),
  credentialsLeaked: z.boolean().nullable(),
  maliciousActivity: z.boolean().nullable(),
  dataBreach: z.boolean().nullable(),
  profiles: z.array(z.string()),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  disposable: z.boolean().nullable(),
  freeProvider: z.boolean().nullable(),
  spoofable: z.boolean().nullable(),
});

export type EmailrepLookupSnapshot = z.infer<
  typeof emailrepLookupSnapshotSchema
>;

/** Map EmailRep JSON including `details.*`. */
export function parseEmailrepBody(
  email: string,
  queriedAt: string,
  body: unknown
): EmailrepLookupSnapshot {
  if (!isRecord(body)) {
    throw parseToolsError("EmailRep", email);
  }
  const details = isRecord(body.details) ? body.details : {};
  const references = asNumber(body.references);
  const profilesRaw = details.profiles;
  const profiles = Array.isArray(profilesRaw)
    ? profilesRaw.flatMap((row) => {
        const value = asString(row);
        return value === null ? [] : [value];
      })
    : [];

  return emailrepLookupSnapshotSchema.parse({
    email,
    queriedAt,
    source: "emailrep.io",
    found: references !== null && references > 0,
    reputation: asString(body.reputation),
    suspicious: body.suspicious === true,
    references,
    credentialsLeaked: asBool(details.credentials_leaked),
    maliciousActivity: asBool(details.malicious_activity),
    dataBreach: asBool(details.data_breach),
    profiles,
    firstSeen: asString(details.first_seen),
    lastSeen: asString(details.last_seen),
    disposable: asBool(details.disposable),
    freeProvider: asBool(details.free_provider),
    spoofable: asBool(details.spoofable),
  });
}

/**
 * EmailRep.io reputation lookup — aggregated risk signal for an email
 * address. `User-Agent` is required; unauthenticated queries are rejected
 * (`Key` header required).
 * GET https://emailrep.io/{email}
 * @see https://docs.sublime.security/reference/emailrep-introduction
 */

interface EmailrepOptions {
  apiKey?: string;
  userAgent?: string;
}

export function fetchEmailrepLookupEffect(
  emailRaw: string,
  signal: AbortSignal,
  options?: EmailrepOptions
): Effect.Effect<EmailrepLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchEmailrepLookupGen() {
    const email = emailRaw.trim().toLowerCase();
    if (!email.includes("@")) {
      return yield* new ValidationVendorError({
        message: `Invalid email: ${emailRaw}`,
      });
    }

    const ua =
      options?.userAgent ?? watchdogUserAgent("identity.emailrep.lookup");
    const key = options?.apiKey?.trim() ?? "";

    const headers: Record<string, string> = {
      Accept: "application/json",
      "User-Agent": ua,
    };
    if (key) headers.Key = key;

    const { status, body } = yield* fetchJsonObjectEffect({
      url: `https://emailrep.io/${encodeURIComponent(email)}`,
      signal,
      service: "EmailRep",
      subject: email,
      acceptStatus: (code) =>
        (code >= 200 && code < 300) || code === 401 || code === 403,
      init: {
        method: "GET",
        headers,
      },
    });

    if (status === 401) {
      return yield* new ValidationVendorError({
        message: `EmailRep API key invalid for ${email}`,
      });
    }
    if (status === 403) {
      return yield* new ValidationVendorError({
        message: `EmailRep rejected request (missing User-Agent) for ${email}`,
      });
    }

    return yield* Effect.try({
      try: () => parseEmailrepBody(email, new Date().toISOString(), body),
      catch: mapToolsCatch,
    });
  });
}
