import type { PgpUid } from "./pgp-schema";

/** One key as a single server reported it, before merging. */
export type HkpKey = {
  /** Uppercase hex the server put in `pub:`: a fingerprint (40 or 64) or a key id (16 or 8). */
  id: string;
  algorithm: number | null;
  bits: number | null;
  created: string | null;
  expires: string | null;
  revoked: boolean;
  /** The server flagged the key expired (`e`). */
  expiredFlag: boolean;
  uids: PgpUid[];
};

const ALGORITHM_NAMES: Readonly<Record<number, string>> = {
  1: "RSA",
  2: "RSA (encrypt only)",
  3: "RSA (sign only)",
  16: "Elgamal",
  17: "DSA",
  18: "ECDH",
  19: "ECDSA",
  22: "EdDSA",
  25: "X25519",
  26: "X448",
  27: "Ed25519",
  28: "Ed448",
};

export function algorithmName(algorithm: number | null): string | null {
  if (algorithm === null) return null;
  return ALGORITHM_NAMES[algorithm] ?? `algorithm ${algorithm}`;
}

const HEX_ID_RE = /^[0-9A-F]+$/;
const ID_LENGTHS = new Set([8, 16, 40, 64]);
const ANGLE_EMAIL_RE = /<([^<>\s]+@[^<>\s]+)>\s*$/;
const BARE_EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+$/;
const NAME_TRAILING_RE = /\s*<[^<>]*>\s*$/;

function epochIso(raw: string | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const seconds = Number(text);
  if (seconds === 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function positiveInt(raw: string | undefined): number | null {
  const text = (raw ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 ? value : null;
}

/** The HKP draft escapes `uid:` text as URL percent-encoding; some servers send it unescaped. */
function unescapeUid(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Split a User ID into its display name and lowercased address. */
export function parseUid(text: string, revoked: boolean): PgpUid {
  const trimmed = text.trim();
  const angled = ANGLE_EMAIL_RE.exec(trimmed);
  let email: string | null = null;
  let name: string | null = null;
  if (angled?.[1] !== undefined) {
    email = angled[1].toLowerCase();
    name = trimmed.replace(NAME_TRAILING_RE, "").trim() || null;
  } else if (BARE_EMAIL_RE.test(trimmed)) {
    email = trimmed.toLowerCase();
  } else {
    name = trimmed || null;
  }
  return { text: trimmed, name, email, revoked };
}

function parsePub(parts: readonly string[]): HkpKey | null {
  const id = (parts[1] ?? "").trim().toUpperCase();
  if (!HEX_ID_RE.test(id) || !ID_LENGTHS.has(id.length)) return null;
  const flags = (parts[6] ?? "").toLowerCase();
  return {
    id,
    algorithm: positiveInt(parts[2]),
    bits: positiveInt(parts[3]),
    created: epochIso(parts[4]),
    expires: epochIso(parts[5]),
    revoked: flags.includes("r"),
    expiredFlag: flags.includes("e"),
    uids: [],
  };
}

/**
 * Parse the machine-readable HKP index (`op=index&options=mr`, HKP draft
 * section 5.2): `info:` is skipped, each `pub:` opens a key
 * (`pub:<id>:<algo>:<bits>:<created>:<expires>:<flags>`) and the `uid:` lines
 * after it belong to it (`uid:<escaped text>:<created>:<expires>:<flags>`).
 * Flags `r` (revoked) and `e` (expired) are read; a `pub:` with an id that is
 * not 8, 16, 40 or 64 hex is skipped with its `uid:` lines.
 */
export function parseHkpMrIndex(body: string): HkpKey[] {
  const keys: HkpKey[] = [];
  let current: HkpKey | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("pub:")) {
      current = parsePub(line.split(":"));
      if (current !== null) keys.push(current);
    } else if (line.startsWith("uid:") && current !== null) {
      const parts = line.split(":");
      // Text, created, expires and flags: an unescaped colon stays in the text.
      const textParts =
        parts.length >= 5 ? parts.slice(1, -3) : parts.slice(1, 2);
      const text = unescapeUid(textParts.join(":")).trim();
      if (text !== "") {
        const flags = (
          parts.length >= 5 ? (parts.at(-1) ?? "") : ""
        ).toLowerCase();
        current.uids.push(parseUid(text, flags.includes("r")));
      }
    }
  }
  return keys;
}
