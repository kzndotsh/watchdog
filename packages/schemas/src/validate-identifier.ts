import { normalizeIdentifierValue } from "./normalize-identifier";
import type { PatchOp } from "./patch";
import { normalizeIdentifierPlatform } from "./platforms";
import { trimmedOrUndefined } from "./primitives";
import { IDENTIFIER_TYPES, type IdentifierType } from "./vocab";

export type ValidateIdentifierResult =
  | { ok: true; value: string }
  | { ok: false; message: string };

export type ValidateIdentifierWriteResult =
  | { ok: true; type: IdentifierType; value: string; platform: string }
  | { ok: false; message: string };

export interface InvalidIdentifierOp {
  opId: string;
  type: string;
  value: string;
  message: string;
}

export const HANDLE_REQUIRES_PLATFORM =
  "platform is required when type is handle";

const PGP_HEX_LENGTHS = new Set([8, 16, 40, 64]);

export function normalizeIdentifierTypeInput(type: string): string {
  const trimmed = trimmedOrUndefined(type);
  return trimmed === undefined ? "" : trimmed.toLowerCase();
}
const IDENTIFIER_TYPE_SET = new Set<string>(IDENTIFIER_TYPES);

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

const SOFT_IDENTIFIER_TYPES = new Set<IdentifierType>([
  "handle",
  "crypto",
  "credential",
  "other",
]);

type StrictIdentifierType = Exclude<
  IdentifierType,
  "handle" | "crypto" | "credential" | "other"
>;

function validateDomainValue(normalized: string): ValidateIdentifierResult {
  if (!isValidDomain(normalized)) {
    return fail("Invalid domain.");
  }
  return { ok: true, value: normalized };
}

function validateIpValue(normalized: string): ValidateIdentifierResult {
  if (!isValidIp(normalized)) {
    return fail("Invalid IP address.");
  }
  return { ok: true, value: normalized };
}

const STRICT_TYPE_VALIDATORS: Record<
  StrictIdentifierType,
  (raw: string, normalized: string) => ValidateIdentifierResult
> = {
  email: (_raw, normalized) =>
    validateEmail(normalized) ?? { ok: true, value: normalized },
  phone: (raw, normalized) =>
    validatePhone(raw, normalized) ?? { ok: true, value: normalized },
  url: (_raw, normalized) =>
    validateUrl(normalized) ?? { ok: true, value: normalized },
  domain: (_raw, normalized) => validateDomainValue(normalized),
  ip: (_raw, normalized) => validateIpValue(normalized),
  pgp: (raw, normalized) =>
    validatePgp(raw, normalized) ?? { ok: true, value: normalized },
};

function isStrictIdentifierType(type: string): type is StrictIdentifierType {
  return Object.hasOwn(STRICT_TYPE_VALIDATORS, type);
}

/**
 * Normalize then soft-strict shape-check Identifier values.
 * Soft types (`handle` / `crypto` / `credential` / `other`) are non-empty only.
 */
export function validateIdentifierValue(
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- callers may pass unvalidated raw JSON `type`
  type: IdentifierType | string,
  value: string
): ValidateIdentifierResult {
  const normalizedType = normalizeIdentifierTypeInput(type);
  if (!IDENTIFIER_TYPE_SET.has(normalizedType)) {
    return fail("Invalid identifier type.");
  }

  const raw = value.trim();
  if (!raw) {
    return fail("Value is required.");
  }

  const normalized = normalizeIdentifierValue(normalizedType, raw);
  if (!normalized) {
    return fail("Value is required.");
  }

  if ((SOFT_IDENTIFIER_TYPES as ReadonlySet<string>).has(normalizedType)) {
    return { ok: true, value: normalized };
  }
  if (!isStrictIdentifierType(normalizedType)) {
    return fail("Invalid identifier type.");
  }

  return STRICT_TYPE_VALIDATORS[normalizedType](raw, normalized);
}

/** Value shape + handle→platform write gate (normalize platform). */
export function validateIdentifierWrite(input: {
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- callers may pass unvalidated raw JSON `type`
  type: IdentifierType | string;
  value: string;
  platform?: string;
}): ValidateIdentifierWriteResult {
  const normalizedType = normalizeIdentifierTypeInput(input.type);
  const validated = validateIdentifierValue(normalizedType, input.value);
  if (!validated.ok) {
    return validated;
  }
  const type = IDENTIFIER_TYPES.find((t) => t === normalizedType);
  if (type === undefined) {
    return { ok: false, message: "Invalid identifier type." };
  }
  const platform = normalizeIdentifierPlatform(input.platform ?? "");
  if (type === "handle" && !platform) {
    return { ok: false, message: HANDLE_REQUIRES_PLATFORM };
  }
  return { ok: true, type, value: validated.value, platform };
}

/** Inbox / Accept preflight — same write gate as core create/Accept. */
export function listInvalidIdentifierOps(
  patch: readonly PatchOp[] | null | undefined
): InvalidIdentifierOp[] {
  const out: InvalidIdentifierOp[] = [];
  for (const op of patch ?? []) {
    if (op.resource !== "identifier") continue;
    if (op.op !== "create" && op.op !== "upsert") continue;

    const type =
      typeof op.data.type === "string"
        ? normalizeIdentifierTypeInput(op.data.type)
        : "";
    const value =
      typeof op.data.value === "string"
        ? (trimmedOrUndefined(op.data.value) ?? "")
        : "";
    const platform =
      typeof op.data.platform === "string" ? op.data.platform.trim() : "";
    const written = validateIdentifierWrite({ type, value, platform });
    if (!written.ok) {
      out.push({
        opId: op.id,
        type,
        value,
        message: written.message,
      });
    }
  }
  return out;
}
