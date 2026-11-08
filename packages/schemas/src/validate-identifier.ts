import { identifierTypeEntry } from "./identifier-types";
import type { ValidateIdentifierResult } from "./identifier-validators";
import { normalizeIdentifierValue } from "./normalize-identifier";
import type { PatchOp } from "./patch";
import { normalizeIdentifierPlatform } from "./platforms";
import { trimmedOrUndefined } from "./primitives";
import { IDENTIFIER_TYPES, type IdentifierType } from "./vocab";

export type ValidateIdentifierWriteResult =
  | { ok: true; type: IdentifierType; value: string; platform: string }
  | { ok: false; message: string };

export type InvalidIdentifierOp = {
  opId: string;
  type: string;
  value: string;
  message: string;
};

export const HANDLE_REQUIRES_PLATFORM =
  "platform is required when type is handle";

export type { ValidateIdentifierResult } from "./identifier-validators";

export function normalizeIdentifierTypeInput(type: string): string {
  const trimmed = trimmedOrUndefined(type);
  return trimmed === undefined ? "" : trimmed.toLowerCase();
}

function fail(message: string): ValidateIdentifierResult {
  return { ok: false, message };
}

/**
 * Normalize then shape-check Identifier values with the type's table entry.
 * Soft types (`handle` / `crypto` / `credential` / `other`) are non-empty only.
 */
export function validateIdentifierValue(
  // oxlint-disable-next-line typescript/no-redundant-type-constituents -- callers may pass unvalidated raw JSON `type`
  type: IdentifierType | string,
  value: string
): ValidateIdentifierResult {
  const normalizedType = normalizeIdentifierTypeInput(type);
  const entry = identifierTypeEntry(normalizedType);
  if (entry === undefined) {
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

  return entry.validate(raw, normalized);
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
