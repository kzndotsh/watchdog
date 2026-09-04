import { isIP } from "node:net";

import { Effect } from "effect";
import type { HttpClient } from "effect/unstable/http";
import { z } from "zod";

import { mapToolsCatch } from "../errors/map-tools-tag";
import type { ToolsTag } from "../errors/tagged-errors";
import { parseToolsError, validationToolsError } from "../errors/tools-error";
import { watchdogUserAgent } from "../errors/user-agent";
import { fetchJsonObjectEffect } from "../http/fetch-json";
import { asString, isRecord } from "../parse/coerce";
import { normalizeHost } from "../whois/normalize";

export const keybaseProofSchema = z.object({
  platform: z.string(),
  username: z.string().nullable(),
  url: z.string().nullable(),
});

export const keybaseLookupSnapshotSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["username", "domain"]),
  queriedAt: z.string().min(1),
  source: z.literal("keybase.io/_/api/1.0/user/lookup"),
  found: z.boolean(),
  username: z.string().nullable(),
  fullName: z.string().nullable(),
  bio: z.string().nullable(),
  location: z.string().nullable(),
  profileUrl: z.string().nullable(),
  proofs: z.array(keybaseProofSchema),
  pgpFingerprints: z.array(z.string()),
  bitcoinAddresses: z.array(z.string()),
  extraUsernames: z.array(z.string()),
});

export type KeybaseProof = z.infer<typeof keybaseProofSchema>;
export type KeybaseLookupSnapshot = z.infer<typeof keybaseLookupSnapshotSchema>;

function classifyQuery(raw: string): {
  kind: "username" | "domain";
  value: string;
  param: "usernames" | "domain";
} {
  const trimmed = raw.trim().replace(/^@/, "");
  if (trimmed.includes(".") && !isIP(trimmed)) {
    return {
      kind: "domain",
      value: normalizeHost(trimmed),
      param: "domain",
    };
  }
  const username = trimmed.toLowerCase();
  if (!/^[a-z0-9][a-z0-9_]{1,15}$/i.test(username)) {
    throw validationToolsError(`Invalid Keybase query: ${raw}`);
  }
  return { kind: "username", value: username, param: "usernames" };
}

function themRows(body: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(body.them)) {
    return body.them.filter((row): row is Record<string, unknown> =>
      isRecord(row)
    );
  }
  if (isRecord(body.them)) return [body.them];
  return [];
}

function emptySnap(
  query: string,
  kind: KeybaseLookupSnapshot["kind"],
  queriedAt: string
): KeybaseLookupSnapshot {
  return keybaseLookupSnapshotSchema.parse({
    query,
    kind,
    queriedAt,
    source: "keybase.io/_/api/1.0/user/lookup",
    found: false,
    username: null,
    fullName: null,
    bio: null,
    location: null,
    profileUrl: null,
    proofs: [],
    pgpFingerprints: [],
    bitcoinAddresses: [],
    extraUsernames: [],
  });
}

function proofFromPresentationRow(
  platform: string,
  row: Record<string, unknown>
): KeybaseProof {
  return {
    platform,
    username: asString(row.nametag) ?? asString(row.username),
    url: asString(row.proof_url) ?? asString(row.human_url),
  };
}

function proofsFromByGroup(byGroup: Record<string, unknown>): KeybaseProof[] {
  const proofs: KeybaseProof[] = [];
  for (const [platform, rows] of Object.entries(byGroup)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!isRecord(row)) continue;
      proofs.push(proofFromPresentationRow(platform, row));
    }
  }
  return proofs;
}

function proofsFromAll(all: unknown[]): KeybaseProof[] {
  const proofs: KeybaseProof[] = [];
  for (const row of all) {
    if (!isRecord(row)) continue;
    const platform = asString(row.proof_type);
    if (platform === null) continue;
    proofs.push({
      platform,
      username: asString(row.nametag),
      url: asString(row.service_url) ?? asString(row.proof_url),
    });
  }
  return proofs;
}

function proofsFromUser(user: Record<string, unknown>): KeybaseProof[] {
  const proofsSummary = isRecord(user.proofs_summary)
    ? user.proofs_summary
    : {};
  const byGroup = proofsSummary.by_presentation_group;
  if (isRecord(byGroup)) {
    const fromGroup = proofsFromByGroup(byGroup);
    if (fromGroup.length > 0) return fromGroup;
  }
  const all = proofsSummary.all;
  if (!Array.isArray(all)) return [];
  return proofsFromAll(all);
}

function pgpFromUser(user: Record<string, unknown>): string[] {
  const fingerprints: string[] = [];
  const publicKeys = isRecord(user.public_keys) ? user.public_keys : {};
  const primary = isRecord(publicKeys.primary) ? publicKeys.primary : {};
  const fp = asString(primary.key_fingerprint);
  if (fp) fingerprints.push(fp.replaceAll(/\s+/g, "").toLowerCase());
  const sibkeys = publicKeys.sibkeys;
  if (Array.isArray(sibkeys)) {
    for (const row of sibkeys) {
      if (!isRecord(row)) continue;
      const extra = asString(row.key_fingerprint);
      if (extra) fingerprints.push(extra.replaceAll(/\s+/g, "").toLowerCase());
    }
  }
  return [...new Set(fingerprints)];
}

function bitcoinFromUser(user: Record<string, unknown>): string[] {
  const crypto = isRecord(user.cryptocurrency_addresses)
    ? user.cryptocurrency_addresses
    : {};
  const btc = crypto.bitcoin;
  if (!Array.isArray(btc)) return [];
  const addresses: string[] = [];
  for (const row of btc) {
    if (!isRecord(row)) continue;
    const addr = asString(row.address);
    if (addr) addresses.push(addr);
  }
  return addresses;
}

export function parseKeybaseBody(
  query: string,
  kind: KeybaseLookupSnapshot["kind"],
  queriedAt: string,
  body: unknown
): KeybaseLookupSnapshot {
  if (!isRecord(body)) {
    throw parseToolsError("Keybase", query);
  }
  const status = isRecord(body.status) ? body.status : null;
  const code = status?.code;
  if (code !== 0 && code !== "0") {
    throw validationToolsError(
      `Keybase status ${String(code)} (${asString(status?.name) ?? "?"}) for ${query}`
    );
  }

  const them = themRows(body);
  const first = them[0];
  if (!first) return emptySnap(query, kind, queriedAt);

  const basics = isRecord(first.basics) ? first.basics : {};
  const profile = isRecord(first.profile) ? first.profile : {};
  const username = asString(basics.username) ?? asString(basics.username_cased);
  const extraUsernames = them.slice(1).flatMap((row) => {
    const rowBasics = isRecord(row.basics) ? row.basics : {};
    const name = asString(rowBasics.username);
    return name === null ? [] : [name];
  });

  return keybaseLookupSnapshotSchema.parse({
    query,
    kind,
    queriedAt,
    source: "keybase.io/_/api/1.0/user/lookup",
    found: true,
    username,
    fullName: asString(profile.full_name),
    bio: asString(profile.bio),
    location: asString(profile.location),
    profileUrl: username ? `https://keybase.io/${username}` : null,
    proofs: proofsFromUser(first),
    pgpFingerprints: pgpFromUser(first),
    bitcoinAddresses: bitcoinFromUser(first),
    extraUsernames,
  });
}

/**
 * Keybase user lookup by username or domain proof.
 * GET https://keybase.io/_/api/1.0/user/lookup.json?usernames=|domain=
 * @see https://keybase.io/docs/api/1.0/call/user/lookup
 */

interface KeybaseOptions {
  userAgent?: string;
}

export function fetchKeybaseLookupEffect(
  queryRaw: string,
  signal: AbortSignal,
  options?: KeybaseOptions
): Effect.Effect<KeybaseLookupSnapshot, ToolsTag, HttpClient.HttpClient> {
  return Effect.gen(function* fetchKeybaseLookupGen() {
    const { kind, value, param } = yield* Effect.try({
      try: () => classifyQuery(queryRaw),
      catch: mapToolsCatch,
    });
    const ua =
      options?.userAgent ?? watchdogUserAgent("identity.keybase.lookup");

    const url = new URL("https://keybase.io/_/api/1.0/user/lookup.json");
    url.searchParams.set(param, value);

    const { body } = yield* fetchJsonObjectEffect({
      url,
      init: {
        method: "GET",
        headers: { Accept: "application/json", "User-Agent": ua },
      },
      signal,
      service: "Keybase",
      subject: value,
    });
    return yield* Effect.try({
      try: () => parseKeybaseBody(value, kind, new Date().toISOString(), body),
      catch: mapToolsCatch,
    });
  });
}
