import { validateIdentifierValue } from "./validate-identifier";

/** What a PGP keyserver query asks for. */
export const PGP_QUERY_KINDS = [
  "email",
  "domain",
  "name",
  "key_id",
  "fingerprint",
] as const;
export type PgpQueryKind = (typeof PGP_QUERY_KINDS)[number];

export type PgpQuery = {
  readonly kind: PgpQueryKind;
  /** Normalized: email and domain lowercase, hex uppercase without `0x`, name trimmed with single spaces. */
  readonly value: string;
};

const NAME_MIN_LENGTH = 3;
const NAME_MAX_LENGTH = 100;
const HOSTNAME_RE = /^[a-z0-9_.-]+$/i;
const HEX_RE = /^[0-9a-f]+$/i;
const NAME_RE = /^[\p{L}\p{M}\p{N} .,'’-]+$/u;
const LETTER_RE = /\p{L}/u;

function classifyDomain(raw: string): PgpQuery | null {
  if (!HOSTNAME_RE.test(raw)) return null;
  const domain = validateIdentifierValue("domain", raw);
  return domain.ok ? { kind: "domain", value: domain.value } : null;
}

function classifyEmailLike(raw: string): PgpQuery | null {
  if (raw.startsWith("@")) return classifyDomain(raw.slice(1));
  const email = validateIdentifierValue("email", raw);
  return email.ok ? { kind: "email", value: email.value } : null;
}

/**
 * `null`: not hex, or hex of a length that names no key. A fingerprint may be
 * written in space or colon separated groups; a key id must be contiguous.
 */
function classifyHex(raw: string): PgpQuery | null | "not-hex" {
  const bare = raw.replace(/^0x/i, "");
  const grouped = bare.replaceAll(/[\s:]+/g, "");
  if (grouped.length === 40 && HEX_RE.test(grouped)) {
    return { kind: "fingerprint", value: grouped.toUpperCase() };
  }
  if (!HEX_RE.test(bare)) return "not-hex";
  if (bare.length === 8 || bare.length === 16) {
    return { kind: "key_id", value: bare.toUpperCase() };
  }
  // A long run of hex that is no key id: refuse rather than search it as a name.
  return bare.length >= 8 ? null : "not-hex";
}

function classifyName(raw: string): PgpQuery | null {
  const name = raw.replaceAll(/\s+/g, " ");
  if (name.length < NAME_MIN_LENGTH || name.length > NAME_MAX_LENGTH) {
    return null;
  }
  if (!NAME_RE.test(name) || !LETTER_RE.test(name)) return null;
  return { kind: "name", value: name };
}

/**
 * Detect what a keyserver query is, unambiguously and in this order:
 * 1. contains `@`: an email (`local@host.tld`) or `@domain`, else invalid;
 * 2. hex of 8 or 16 characters (key id) or 40 (fingerprint), `0x` optional;
 *    any other long run of hex is invalid;
 * 3. a hostname (`example.com`): a domain;
 * 4. letters, digits, spaces and `. , ' -`, at least one letter: a name.
 *
 * A dotted word with no spaces and a 2+ letter last label (`j.smith`) is a
 * domain, not a name.
 */
export function classifyPgpQuery(input: string): PgpQuery | null {
  const raw = input.trim();
  if (raw === "") return null;
  if (raw.includes("@")) return classifyEmailLike(raw);
  const hex = classifyHex(raw);
  if (hex !== "not-hex") return hex;
  return classifyDomain(raw) ?? classifyName(raw);
}
