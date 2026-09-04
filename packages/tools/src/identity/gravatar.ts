import { createHash } from "node:crypto";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString, isRecord, recordRows } from "../parse/coerce";
import { normalizeEmail } from "./email-lookup";

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

  return gravatarLookupSnapshotSchema.parse({
    email,
    hash,
    queriedAt,
    source: "secure.gravatar.com",
    found: true,
    displayName: asString(entryRaw.displayName),
    preferredUsername: asString(entryRaw.preferredUsername),
    profileUrl: asString(entryRaw.profileUrl),
    location: asString(entryRaw.currentLocation),
    aboutMe: asString(entryRaw.aboutMe),
    emails,
    accounts,
  });
}

/**
 * Gravatar profile by email MD5.
 * GET https://secure.gravatar.com/{md5}.json — 404 = no public profile.
 * @see https://docs.gravatar.com/api/profiles/
 */

interface GravatarOptions {
  userAgent?: string;
}

export function fetchGravatarLookupEffect(
  emailRaw: string,
  signal: AbortSignal,
  options?: GravatarOptions
): Effect.Effect<GravatarLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchGravatarLookupGen() {
    const { email } = yield* Effect.try({
      try: () => normalizeEmail(emailRaw),
      catch: mapToolsCatch,
    });
    const hash = gravatarEmailHash(email);
    const ua =
      options?.userAgent ?? watchdogUserAgent("identity.gravatar.lookup");

    const url = `https://secure.gravatar.com/${hash}.json`;
    const { status, body } = yield* fetchJsonObjectEffect({
      url,
      signal,
      service: "Gravatar",
      subject: hash,
      acceptStatus: (code) => (code >= 200 && code < 300) || code === 404,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
    });

    if (status === 404) {
      return emptyGravatar(email, hash, new Date().toISOString());
    }

    return parseGravatarBody(email, hash, new Date().toISOString(), body);
  });
}
