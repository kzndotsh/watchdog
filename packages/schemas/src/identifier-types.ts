import {
  canonicalizeDomain,
  canonicalizeEmail,
  canonicalizeIp,
  canonicalizePgp,
  canonicalizePhone,
  canonicalizeUrl,
} from "./identifier-canonical";
import {
  type IdentifierValidator,
  validateDomainValue,
  validateEmailValue,
  validateIpValue,
  validatePgpValue,
  validatePhoneValue,
  validateSoftValue,
  validateUrlValue,
} from "./identifier-validators";
import { expandIpv6 } from "./ip";
import { IDENTIFIER_TYPES, type IdentifierType } from "./vocab";

/** What one Identifier type is: how it is stored, checked and spotted in pasted text. */
export type IdentifierTypeEntry = {
  /** Storage form of a trimmed, non-empty value; absent means identity. Run to a fixed point by `normalizeIdentifierValue`. */
  canonicalize?: (raw: string) => string;
  /** Shape check of a canonical value; soft types accept any non-empty one. */
  validate: IdentifierValidator;
  /** Whether pasted text, as written, is this type. Absent means the type is never inferred from a paste. */
  recognise?: (raw: string) => boolean;
};

const IPV4_RE =
  /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

/** A bare IPv4 or IPv6 address (an embedded dotted tail allowed); `expandIpv6` is the IPv6 grammar. */
function recogniseIp(raw: string): boolean {
  const value = raw.trim();
  if (!value.includes(":")) return IPV4_RE.test(value);
  try {
    expandIpv6(value);
    return true;
  } catch {
    return false;
  }
}

const soft: IdentifierTypeEntry = { validate: validateSoftValue };

/**
 * The one Identifier type table. The mapped type is exhaustive: a type added to
 * `IDENTIFIER_TYPES` without an entry fails to compile. Canonicalization,
 * validation and paste recognition all read it.
 */
export const IDENTIFIER_TYPE_TABLE: Readonly<
  Record<IdentifierType, IdentifierTypeEntry>
> = {
  email: {
    canonicalize: canonicalizeEmail,
    validate: validateEmailValue,
    recognise: (raw) => EMAIL_RE.test(raw.trim()),
  },
  handle: soft,
  phone: { canonicalize: canonicalizePhone, validate: validatePhoneValue },
  url: { canonicalize: canonicalizeUrl, validate: validateUrlValue },
  domain: {
    canonicalize: canonicalizeDomain,
    validate: validateDomainValue,
    recognise: (raw) => DOMAIN_RE.test(raw.trim()),
  },
  ip: {
    canonicalize: canonicalizeIp,
    validate: validateIpValue,
    recognise: recogniseIp,
  },
  crypto: soft,
  pgp: { canonicalize: canonicalizePgp, validate: validatePgpValue },
  credential: soft,
  other: soft,
};

function isIdentifierType(type: string): type is IdentifierType {
  return (IDENTIFIER_TYPES as readonly string[]).includes(type);
}

/** The table entry for a type name, or `undefined` when it is not an Identifier type. */
export function identifierTypeEntry(
  type: string
): IdentifierTypeEntry | undefined {
  return isIdentifierType(type) ? IDENTIFIER_TYPE_TABLE[type] : undefined;
}
