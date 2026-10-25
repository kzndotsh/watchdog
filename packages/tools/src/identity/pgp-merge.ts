import { algorithmName, type HkpKey } from "./pgp-hkp";
import type { PgpKeyHit, PgpUid } from "./pgp-schema";

/** What one server returned, in server order. */
export type ServerKeys = {
  readonly host: string;
  readonly keys: readonly HkpKey[];
};

type Seen = { host: string; key: HkpKey };

function isFingerprint(id: string): boolean {
  return id.length >= 40;
}

function uidKey(uid: PgpUid): string {
  return uid.text.toLowerCase().replaceAll(/\s+/g, " ");
}

function unionUids(seen: readonly Seen[]): PgpUid[] {
  const byKey = new Map<string, PgpUid>();
  for (const { key } of seen) {
    for (const uid of key.uids) {
      const id = uidKey(uid);
      const known = byKey.get(id);
      if (known === undefined) byKey.set(id, { ...uid });
      else if (uid.revoked) known.revoked = true;
    }
  }
  return [...byKey.values()];
}

function firstOf<T>(values: readonly (T | null)[]): T | null {
  return values.find((value): value is T => value !== null) ?? null;
}

/** The latest expiry any server reports: a newer self-signature extends it, and a server that lacks it shows the older date. */
function latestExpiry(values: readonly (string | null)[]): string | null {
  let latest: string | null = null;
  for (const value of values) {
    if (value !== null && (latest === null || value > latest)) latest = value;
  }
  return latest;
}

function mergeGroup(seen: readonly Seen[], nowMs: number): PgpKeyHit {
  const keys = seen.map((entry) => entry.key);
  const fingerprint =
    seen.map((entry) => entry.key.id).find(isFingerprint) ?? null;
  const algorithm = firstOf(keys.map((key) => key.algorithm));
  const expires = latestExpiry(keys.map((key) => key.expires));
  const expired =
    expires === null
      ? keys.some((key) => key.expiredFlag)
      : Date.parse(expires) <= nowMs;
  return {
    fingerprint,
    keyId: (fingerprint ?? seen[0]?.key.id ?? "").slice(-16),
    algorithm,
    algorithmName: algorithmName(algorithm),
    bits: firstOf(keys.map((key) => key.bits)),
    created: firstOf(keys.map((key) => key.created)),
    expires,
    revoked: keys.some((key) => key.revoked),
    expired,
    uids: unionUids(seen),
    servers: [...new Set(seen.map((entry) => entry.host))],
  };
}

/**
 * Merge the keys of every server into one list.
 *
 * - A key with a full fingerprint merges with the same full fingerprint, and
 *   never on a suffix of it.
 * - A key a server returned only as a 16 hex key id joins the fingerprint
 *   whose last 16 hex digits equal it, when exactly one such fingerprint was
 *   returned; with none or several it stays its own entry keyed by that id,
 *   so two keys that share a long key id are never fused.
 * - An 8 hex short id is never merged with anything but the same short id.
 *
 * UIDs are unioned and deduplicated ignoring case and spacing. The merged key
 * is revoked when any server says so.
 */
export function mergeServerKeys(
  results: readonly ServerKeys[],
  nowMs: number
): PgpKeyHit[] {
  const byFingerprint = new Map<string, Seen[]>();
  const byKeyId = new Map<string, Seen[]>();
  const idOnly: Seen[] = [];
  for (const { host, keys } of results) {
    for (const key of keys) {
      const seen = { host, key };
      if (isFingerprint(key.id)) {
        const group = byFingerprint.get(key.id) ?? [];
        group.push(seen);
        byFingerprint.set(key.id, group);
      } else {
        idOnly.push(seen);
      }
    }
  }
  for (const seen of idOnly) {
    const matches =
      seen.key.id.length === 16
        ? [...byFingerprint.keys()].filter((fp) => fp.endsWith(seen.key.id))
        : [];
    const target = matches.length === 1 ? matches[0] : undefined;
    const group =
      target === undefined
        ? (byKeyId.get(seen.key.id) ?? [])
        : (byFingerprint.get(target) ?? []);
    group.push(seen);
    if (target === undefined) byKeyId.set(seen.key.id, group);
  }
  return [...byFingerprint.values(), ...byKeyId.values()].map((group) =>
    mergeGroup(group, nowMs)
  );
}

/**
 * Keep keys with a UID address on exactly `domain` (case-insensitive; a
 * subdomain does not match). A kept key keeps all of its UIDs. Servers that
 * keyword-match return keys that only mention the domain elsewhere.
 */
export function keepKeysOnDomain(
  keys: readonly PgpKeyHit[],
  domain: string
): PgpKeyHit[] {
  const wanted = domain.trim().toLowerCase();
  return keys.filter((key) =>
    key.uids.some(
      (uid) =>
        uid.email !== null &&
        uid.email.slice(uid.email.lastIndexOf("@") + 1) === wanted
    )
  );
}
