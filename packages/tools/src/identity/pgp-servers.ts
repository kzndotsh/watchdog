import type { PgpQueryInput, PgpQueryKind } from "./pgp-schema";

/**
 * The keyservers, HTTPS on the default port only. Every one answers the HKP
 * machine-readable index (`/pks/lookup?op=index&options=mr`); they differ in
 * which searches they accept.
 */
export type PgpKeyserver = {
  readonly host: string;
  readonly kinds: ReadonlySet<PgpQueryKind>;
  /** Shortest key id the server accepts; 8 hex short ids are refused when this is 16. */
  readonly minKeyIdLength: 8 | 16;
  /** Documented to look up 64 hex (v6) fingerprints. keys.openpgp.org and Mailvelope document v4 only. */
  readonly v6Fingerprint: boolean;
};

const ALL_KINDS: ReadonlySet<PgpQueryKind> = new Set([
  "email",
  "domain",
  "name",
  "key_id",
  "fingerprint",
]);

/** keys.openpgp.org and keys.mailvelope.com answer only exact email, fingerprint and long key id. */
const EXACT_KINDS: ReadonlySet<PgpQueryKind> = new Set([
  "email",
  "key_id",
  "fingerprint",
]);

export const PGP_KEYSERVERS: readonly PgpKeyserver[] = [
  {
    host: "keyserver.ubuntu.com",
    kinds: ALL_KINDS,
    minKeyIdLength: 8,
    v6Fingerprint: true,
  },
  {
    host: "keys.openpgp.org",
    kinds: EXACT_KINDS,
    minKeyIdLength: 16,
    v6Fingerprint: false,
  },
  {
    host: "pgp.mit.edu",
    kinds: ALL_KINDS,
    minKeyIdLength: 8,
    v6Fingerprint: true,
  },
  {
    host: "keys.mailvelope.com",
    kinds: EXACT_KINDS,
    minKeyIdLength: 16,
    v6Fingerprint: false,
  },
  {
    host: "pgpkeys.eu",
    kinds: ALL_KINDS,
    minKeyIdLength: 8,
    v6Fingerprint: true,
  },
];

/** Why the server cannot answer this query, or null when it can. */
export function skipReason(
  server: PgpKeyserver,
  query: PgpQueryInput
): string | null {
  if (!server.kinds.has(query.kind)) {
    return `unsupported query kind: ${query.kind}`;
  }
  if (query.kind === "key_id" && query.value.length < server.minKeyIdLength) {
    return "unsupported query kind: short key id";
  }
  if (
    query.kind === "fingerprint" &&
    query.value.length === 64 &&
    !server.v6Fingerprint
  ) {
    return "unsupported query kind: v6 fingerprint";
  }
  return null;
}

/** The HKP `search` term: `0x` before a key id or fingerprint, `@` before a domain. */
export function hkpSearchTerm(query: PgpQueryInput): string {
  switch (query.kind) {
    case "key_id":
    case "fingerprint": {
      return `0x${query.value}`;
    }
    case "domain": {
      return `@${query.value}`;
    }
    case "email":
    case "name": {
      return query.value;
    }
    default: {
      const exhaustive: never = query.kind;
      return exhaustive;
    }
  }
}

export function hkpIndexUrl(host: string, query: PgpQueryInput): string {
  return `https://${host}/pks/lookup?op=index&options=mr&search=${encodeURIComponent(hkpSearchTerm(query))}`;
}
