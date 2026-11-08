export type ValidateIdentifierResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

/** Shape-check a value already canonicalized from `raw`. */
export type IdentifierValidator = (
  raw: string,
  normalized: string
) => ValidateIdentifierResult;

const PGP_HEX_LENGTHS = new Set([8, 16, 40, 64]);

function fail(message: string): ValidateIdentifierResult {
  return { ok: false, message };
}

function isValidIpv4(value: string): boolean {
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const n = Number(part);
    return n >= 0 && n <= 255;
  });
}

/** At most one `::`; 1–8 groups of 1–4 hex; optional trailing IPv4-mapped dotted-quad. */
function ipv6HasInvalidCompression(value: string): boolean {
  return (value.match(/::/g) ?? []).length > 1 || value.includes(":::");
}

function splitIpv6Value(
  value: string
): { head: string; ipv4Tail: string | null } | null {
  const head = value;
  const ipv4Tail: string | null = null;
  const lastColon = value.lastIndexOf(":");
  if (lastColon === -1) return { head, ipv4Tail };

  const after = value.slice(lastColon + 1);
  if (!after.includes(".")) return { head, ipv4Tail };
  if (!isValidIpv4(after)) return null;
  return { head: value.slice(0, lastColon), ipv4Tail: after };
}

function parseIpv6HexGroups(head: string): string[] | null {
  if (head === "::" || head === "") return [];

  const compressed = head.includes("::");
  const sides = compressed ? head.split("::") : [head];
  if (sides.length > 2) return null;

  const groups: string[] = [];
  for (const side of sides) {
    if (side === "") continue;
    const parts = side.split(":");
    if (parts.some((part) => part === "" || !/^[0-9a-fA-F]{1,4}$/.test(part))) {
      return null;
    }
    groups.push(...parts);
  }
  return groups;
}

function ipv6GroupsWithinLimit(
  groups: string[],
  compressed: boolean,
  ipv4Tail: string | null
): boolean {
  const maxGroups = ipv4Tail === null ? 8 : 6;
  if (compressed) return groups.length < maxGroups;
  return groups.length === maxGroups;
}

function isValidIpv6(value: string): boolean {
  if (ipv6HasInvalidCompression(value)) return false;

  const split = splitIpv6Value(value);
  if (split === null) return false;
  const { head, ipv4Tail } = split;

  if (head === "::" || head === "") {
    return ipv4Tail !== null || value === "::";
  }

  const groups = parseIpv6HexGroups(head);
  if (groups === null) return false;
  if (!ipv6GroupsWithinLimit(groups, head.includes("::"), ipv4Tail)) {
    return false;
  }
  return groups.length >= 1 || ipv4Tail !== null || value === "::";
}

function isValidIp(value: string): boolean {
  if (value.includes(".")) {
    if (value.includes(":")) return isValidIpv6(value);
    return isValidIpv4(value);
  }
  if (value.includes(":")) return isValidIpv6(value);
  return false;
}

function isValidDomain(value: string): boolean {
  if (
    !value ||
    value.includes(" ") ||
    value.includes("/") ||
    value.includes(":")
  ) {
    return false;
  }
  if (!value.includes(".")) return false;
  // Labels: letter/digit/underscore start; hyphens/underscores inside; 1–63 chars.
  return /^(?:[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?\.)+[a-z]{2,63}$/i.test(
    value
  );
}

function validateEmail(normalized: string): ValidateIdentifierResult | null {
  if (normalized.includes(" ")) {
    return fail("Invalid email.");
  }
  const parts = normalized.split("@");
  if (parts.length !== 2) {
    return fail("Invalid email.");
  }
  const [local, domain] = parts;
  if (!local || !domain || !domain.includes(".")) {
    return fail("Invalid email.");
  }
  return null;
}

function validatePhone(
  raw: string,
  normalized: string
): ValidateIdentifierResult | null {
  const body = raw.startsWith("+") ? raw.slice(1) : raw;
  if (/[a-zA-Z]/.test(body)) {
    return fail("Phone can’t include letters.");
  }
  const digits = normalized.startsWith("+") ? normalized.slice(1) : normalized;
  if (digits.length < 7 || digits.length > 15) {
    return fail("Phone needs 7–15 digits.");
  }
  return null;
}

function validateUrl(normalized: string): ValidateIdentifierResult | null {
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fail("Invalid URL.");
    }
  } catch {
    return fail("Invalid URL.");
  }
  return null;
}

function validatePgp(
  raw: string,
  normalized: string
): ValidateIdentifierResult | null {
  if (/^-----BEGIN PGP /i.test(raw.trim())) {
    return null;
  }
  const compact = normalized.replaceAll(/[\s:]+/g, "");
  if (/^[0-9A-F]+$/i.test(compact) && PGP_HEX_LENGTHS.has(compact.length)) {
    return null;
  }
  return fail("Invalid PGP fingerprint or key.");
}

function ok(value: string): ValidateIdentifierResult {
  return { ok: true, value };
}

export const validateEmailValue: IdentifierValidator = (_raw, normalized) =>
  validateEmail(normalized) ?? ok(normalized);

export const validatePhoneValue: IdentifierValidator = (raw, normalized) =>
  validatePhone(raw, normalized) ?? ok(normalized);

export const validateUrlValue: IdentifierValidator = (_raw, normalized) =>
  validateUrl(normalized) ?? ok(normalized);

export const validatePgpValue: IdentifierValidator = (raw, normalized) =>
  validatePgp(raw, normalized) ?? ok(normalized);

export const validateDomainValue: IdentifierValidator = (_raw, normalized) =>
  isValidDomain(normalized) ? ok(normalized) : fail("Invalid domain.");

export const validateIpValue: IdentifierValidator = (_raw, normalized) =>
  isValidIp(normalized) ? ok(normalized) : fail("Invalid IP address.");

/** Soft types (handle, crypto, credential, other): non-empty is enough, and the caller has checked that. */
export const validateSoftValue: IdentifierValidator = (_raw, normalized) =>
  ok(normalized);
