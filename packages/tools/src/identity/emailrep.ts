import { z } from "zod";

import { ValidationVendorError } from "../errors/tagged-errors";
import { parseVendorError } from "../errors/vendor-errors";
import { defineJsonProvider } from "../http/define-json-provider";
import { normalizeEmail } from "../normalize";
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
    throw parseVendorError("EmailRep", email);
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
    // EmailRep returns reputation + references (often 0) for valid lookups with no footprint.
    found: asString(body.reputation) !== null,
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

type EmailrepOptions = {
  apiKey: string;
  userAgent: string;
};

const lookupEmailrep = defineJsonProvider({
  service: "EmailRep",
  schema: emailrepLookupSnapshotSchema,
  key: { header: "Key" },
  normalize: (raw) => normalizeEmail(raw).email,
  request: (email, _options: EmailrepOptions) => ({
    url: `https://emailrep.io/${encodeURIComponent(email)}`,
  }),
  // 401 and 403 are the vendor refusing the call; each is a caller-visible failure, not "unknown".
  notFoundStatuses: [401, 403],
  notFound: ({ status }) => {
    if (status === 401) {
      throw new ValidationVendorError({
        message: "EmailRep API key invalid",
        cause: "HTTP 401",
      });
    }
    throw new ValidationVendorError({
      message: "EmailRep rejected request (missing User-Agent)",
      cause: "HTTP 403",
    });
  },
  toSnapshot: ({ subject: email, queriedAt, body }) =>
    parseEmailrepBody(email, queriedAt, body),
});

export function fetchEmailrepLookupEffect(
  emailRaw: string,
  signal: AbortSignal,
  options: EmailrepOptions
) {
  return lookupEmailrep(emailRaw, options.apiKey, signal, options);
}
