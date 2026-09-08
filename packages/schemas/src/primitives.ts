import { z } from "zod";

import type { JsonValue } from "./json";

export const uuidSchema = z.uuid();

/** Required UUID — trims surrounding whitespace before validation. */
export const trimmedUuidSchema = z.string().trim().pipe(uuidSchema);

/** Trim + validate a scoped case/graph UUID; invalid input → null. */
export function parseTrimmedCaseId(raw: string): string | null {
  const parsed = trimmedUuidSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Optional graph UUID — null/undefined/invalid → undefined. */
export function parseOptionalTrimmedUuid(
  raw: string | null | undefined
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  return parseTrimmedCaseId(raw) ?? undefined;
}

/** True when `value` is a canonical UUID (not a catalog slug like `host-footprint`). */
export function isUuidString(value: string): boolean {
  return parseTrimmedCaseId(value) !== null;
}

export const nonEmptyTrimmed = z.string().trim().min(1);

/** Vault credential slot name — SCREAMING_SNAKE (A-Z, 0-9, _). */
export const credentialNameSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Z][A-Z0-9_]*$/,
    "Credential name must be SCREAMING_SNAKE (A-Z, 0-9, _)"
  );

/** Trim; empty / whitespace → undefined (optional field absent). */
export function trimmedOrUndefined(
  value: string | null | undefined
): string | undefined {
  const t = value?.trim();
  return t === undefined || t === "" ? undefined : t;
}

/** Trim; empty / whitespace → null. */
export function trimmedOrNull(value: string | null | undefined): string | null {
  return trimmedOrUndefined(value) ?? null;
}

/** Nullable UUID: null or blank/whitespace → null; otherwise trim + validate. */
export const nullableUuidSchema = z.preprocess(
  (value) => {
    if (value === null) return null;
    if (typeof value !== "string") return value;
    return trimmedOrUndefined(value) ?? null;
  },
  z.union([z.null(), trimmedUuidSchema])
);

/** Optional string that collapses blank / whitespace to absent. */
export const optionalTrimmedSchema = z.preprocess((value) => {
  if (value === undefined || typeof value !== "string") return value;
  return trimmedOrUndefined(value);
}, z.string().optional());

/** Optional UUID: absent/blank/whitespace → undefined; otherwise trim + validate. */
export const optionalUuidSchema = z.preprocess((value) => {
  if (value === undefined || typeof value !== "string") return value;
  return trimmedOrUndefined(value);
}, trimmedUuidSchema.optional());

/** PATCH field: omit = no change; null or blank = clear; non-blank = set. */
export const nullableTrimmedPatchSchema = z
  .union([z.null(), z.string()])
  .optional()
  .transform((value) =>
    value === undefined ? undefined : trimmedOrNull(value)
  );

/** Case / entity slug from a display name (lowercase, kebab, max 64). */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 64);
}

/** Normalized entity/case slug — slugifies then requires a non-empty result. */
export const entitySlugSchema = z
  .string()
  .transform((value) => slugifyName(value))
  .pipe(z.string().min(1));

export const sha256HexSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z.string().regex(/^[a-f0-9]{64}$/, {
      error: "Expected 64-char lowercase hex SHA-256",
    })
  );

/** Max Intake / Evidence file upload size (presign + PUT + confirm). */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/** MIME type for uploads — blank defaults to application/octet-stream. */
export const mimeInputSchema = z
  .string()
  .transform((value) => value.trim() || "application/octet-stream");

export const httpUrlSchema = z
  .string()
  .trim()
  .pipe(
    z.url().refine(
      (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
      { error: "URL must be http or https" }
    )
  );

/** Optional http(s) URL — blank/whitespace becomes undefined. */
export const optionalHttpUrlSchema = z
  .string()
  .optional()
  .transform((value) => trimmedOrUndefined(value))
  .pipe(
    z.custom<string | undefined>(
      (value) => value === undefined || httpUrlSchema.safeParse(value).success,
      { message: "URL must be http or https" }
    )
  );

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidDueDate(value: string): boolean {
  const trimmed = value.trim();
  const dateOnly = DATE_ONLY.exec(trimmed);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return (
      utc.getUTCFullYear() === year &&
      utc.getUTCMonth() === month - 1 &&
      utc.getUTCDate() === day
    );
  }
  return !Number.isNaN(new Date(trimmed).getTime());
}

/** Task due date on create/update — rejects unparseable strings; null clears. */
export const dueDateInputSchema = z
  .string()
  .transform((value) => value.trim())
  .refine(isValidDueDate, {
    message: "Invalid due date",
  });

/** Null or blank/whitespace clears; otherwise trim + validate. */
export const dueDatePatchSchema = z.preprocess(
  (value) => {
    if (value === null) return null;
    if (typeof value !== "string") return value;
    return trimmedOrUndefined(value) ?? null;
  },
  z.union([z.null(), dueDateInputSchema])
);

export const optionalDueDatePatchSchema = dueDatePatchSchema.optional();

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

/** Trim actor id (user UUID, api-key label, test fixture); blank → undefined. */
export function parseActorId(raw: string): string | undefined {
  return trimmedOrUndefined(raw);
}

/** Trim, drop empties and non-strings, dedupe — shared by core services and link repos. */
export function normalizeIdList(
  ids: Iterable<string | null | undefined>
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed) out.push(trimmed);
  }
  return [...new Set(out)];
}

/** Trim, validate, dedupe graph UUIDs; drops blank and invalid entries. */
export function normalizeUuidList(
  ids: Iterable<string | null | undefined>
): string[] {
  const out: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const parsed = parseTrimmedCaseId(id);
    if (parsed !== null) out.push(parsed);
  }
  return [...new Set(out)];
}

/**
 * Trim/dedupe non-empty ids; `null` when any non-empty entry is not a valid UUID.
 * Empty input → `[]`.
 */
export function parseGraphUuidList(
  ids: Iterable<string | null | undefined>
): string[] | null {
  const requested = normalizeIdList(ids);
  if (requested.length === 0) return [];
  const valid = normalizeUuidList(ids);
  return valid.length === requested.length ? valid : null;
}

export const uuidListSchema = z
  .array(z.string())
  .transform((ids) => normalizeIdList(ids).map((id) => uuidSchema.parse(id)));
