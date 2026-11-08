import { isValidIp } from "./ip";

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

/** The domain grammar: validation and paste recognition share it. */
export function isValidDomain(value: string): boolean {
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
  if (/\s/.test(normalized)) {
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
