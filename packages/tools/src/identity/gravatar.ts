import { createHash } from "node:crypto";

import { z } from "zod";

import { defineJsonProvider } from "../http/define-json-provider";
import { normalizeEmail } from "../normalize";
import { asString, isRecord, recordRows } from "../parse/coerce";

export const gravatarAccountSchema = z.object({
  shortname: z.string().nullable(),
  url: z.string().nullable(),
  username: z.string().nullable(),
});

export const gravatarLookupSnapshotSchema = z.object({
  email: z.string().min(1),
  hash: z.string().min(1),
  queriedAt: z.string().min(1),
  source: z.literal("secure.gravatar.com"),
  found: z.boolean(),
  displayName: z.string().nullable(),
  preferredUsername: z.string().nullable(),
  profileUrl: z.string().nullable(),
  location: z.string().nullable(),
  aboutMe: z.string().nullable(),
  emails: z.array(z.string()),
  accounts: z.array(gravatarAccountSchema),
});

export type GravatarAccount = z.infer<typeof gravatarAccountSchema>;
export type GravatarLookupSnapshot = z.infer<
  typeof gravatarLookupSnapshotSchema
>;

/** MD5 hex of lowercased trimmed email — Gravatar profile id. */
export function gravatarEmailHash(email: string): string {
  return createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

function emptyGravatar(
  email: string,
  hash: string,
  queriedAt: string
): GravatarLookupSnapshot {
  return gravatarLookupSnapshotSchema.parse({
    email,
    hash,
    queriedAt,
    source: "secure.gravatar.com",
    found: false,
    displayName: null,
    preferredUsername: null,
    profileUrl: null,
    location: null,
    aboutMe: null,
    emails: [],
    accounts: [],
  });
}

/** MD5 `.json` profile, first `entry[0]`. */
export function parseGravatarBody(
  email: string,
  hash: string,
  queriedAt: string,
  body: unknown
): GravatarLookupSnapshot {
  const entryRaw = isRecord(body) ? recordRows(body.entry)[0] : undefined;
  if (!isRecord(entryRaw)) return emptyGravatar(email, hash, queriedAt);

  const emails: string[] = [];
  const seenEmail = new Set<string>();
  if (Array.isArray(entryRaw.emails)) {
    for (const row of entryRaw.emails) {
      const v = isRecord(row) ? asString(row.value) : asString(row);
      if (!v) continue;
      const norm = v.toLowerCase();
      if (seenEmail.has(norm)) continue;
      seenEmail.add(norm);
      emails.push(norm);
    }
  }

  const accounts: GravatarAccount[] = [];
  if (Array.isArray(entryRaw.accounts)) {
    for (const row of entryRaw.accounts) {
      if (!isRecord(row)) continue;
      accounts.push({
        shortname: asString(row.shortname),
        url: asString(row.url),
        username: asString(row.username),
      });
    }
  }

  const displayName = asString(entryRaw.displayName);
  const preferredUsername = asString(entryRaw.preferredUsername);
  const profileUrl = asString(entryRaw.profileUrl);
  const location = asString(entryRaw.currentLocation);
  const aboutMe = asString(entryRaw.aboutMe);

  const hasHit =
    displayName !== null ||
    preferredUsername !== null ||
    profileUrl !== null ||
    location !== null ||
    aboutMe !== null ||
    emails.length > 0 ||
    accounts.some(
      (row) =>
        row.shortname !== null || row.url !== null || row.username !== null
    );
  if (!hasHit) return emptyGravatar(email, hash, queriedAt);

  return gravatarLookupSnapshotSchema.parse({
    email,
    hash,
    queriedAt,
    source: "secure.gravatar.com",
    found: true,
    displayName,
    preferredUsername,
    profileUrl,
    location,
    aboutMe,
    emails,
    accounts,
  });
}

/**
 * Gravatar profile by email MD5.
 * GET https://secure.gravatar.com/{md5}.json — 404 = no public profile.
 * @see https://docs.gravatar.com/api/profiles/
 */

type GravatarOptions = {
  userAgent: string;
};

export const fetchGravatarLookupEffect = defineJsonProvider({
  service: "Gravatar",
  schema: gravatarLookupSnapshotSchema,
  // The vendor and its errors know the subject by its hash, never the address.
  normalize: (raw) => {
    const { email } = normalizeEmail(raw);
    return { value: gravatarEmailHash(email), email };
  },
  request: ({ value: hash }, _options: GravatarOptions) => ({
    url: `https://secure.gravatar.com/${hash}.json`,
  }),
  notFound: ({ subject: { email, value: hash }, queriedAt }) =>
    emptyGravatar(email, hash, queriedAt),
  toSnapshot: ({ subject: { email, value: hash }, queriedAt, body }) =>
    parseGravatarBody(email, hash, queriedAt, body),
});
