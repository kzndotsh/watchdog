import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import type { CaseId } from "./ids";
import type { JsonValue } from "./json";
import { ARRAY_MAX, BODY_MAX, NAME_MAX, SLUG_MAX, URL_MAX } from "./limits";

export const uuidSchema = z.uuid();

/** Required UUID — trims surrounding whitespace before validation. */
export const trimmedUuidSchema = z
  .string()
  .trim()
  .max(NAME_MAX)
  .pipe(uuidSchema);

/**
 * Trim + validate a graph UUID of any NON-Case kind (entity, job, evidence,
 * edge, playbook run, ...); invalid input → null. Returns a plain `string`:
 * for a Case id use {@link parseTrimmedCaseId}.
 */
export function parseTrimmedUuid(raw: string): string | null {
  const parsed = trimmedUuidSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Trim + validate a CASE id only; invalid input → null. The result is branded
 * `CaseId`: never use this for entity/job/evidence/edge/run ids (it would lie
 * about the type); use {@link parseTrimmedUuid} for those.
 */
export function parseTrimmedCaseId(raw: string): CaseId | null {
  const parsed = trimmedCaseIdSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Optional graph UUID — null/undefined/invalid → undefined. */
export function parseOptionalTrimmedUuid(
  raw: string | null | undefined
): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  return parseTrimmedUuid(raw) ?? undefined;
}

/** True when `value` is a canonical UUID (not a catalog slug like `host-footprint`). */
export function isUuidString(value: string): boolean {
  return parseTrimmedUuid(value) !== null;
}

/**
 * Required text: trimmed, non-empty, at most `max` characters. `max` is a named limit
 * from `limits.ts` (`NAME_MAX`, `TITLE_MAX`, `NOTES_MAX`, ...), never a bare number.
 */
export const requiredText = (max: number) => z.string().trim().min(1).max(max);

/** Vault credential slot name — SCREAMING_SNAKE (A-Z, 0-9, _). */
export const credentialNameSchema = z
  .string()
  .trim()
  .max(NAME_MAX)
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

/** Optional text (at most `max`) that collapses blank / whitespace to absent. */
export const optionalText = (max: number) =>
  z.preprocess((value) => {
    if (value === undefined || typeof value !== "string") return value;
    return trimmedOrUndefined(value);
  }, z.string().max(max).optional());

/** Optional UUID: absent/blank/whitespace → undefined; otherwise trim + validate. */
export const optionalUuidSchema = z.preprocess((value) => {
  if (value === undefined || typeof value !== "string") return value;
  return trimmedOrUndefined(value);
}, trimmedUuidSchema.optional());

/** Optional Case id: absent/blank/whitespace → undefined; otherwise trim + validate. */
export const optionalCaseIdSchema = z.preprocess((value) => {
  if (value === undefined || typeof value !== "string") return value;
  return trimmedOrUndefined(value);
}, trimmedCaseIdSchema.optional());

/** PATCH field: omit = no change; null or blank = clear; non-blank = set (at most `max`). */
export const nullableTextPatch = (max: number) =>
  z
    .union([z.null(), z.string().trim().max(max)])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : trimmedOrNull(value)
    );

/** Case / entity slug from a display name (lowercase, kebab, at most `SLUG_MAX`). */
export function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, SLUG_MAX);
}

/** Normalized entity/case slug — slugifies then requires a non-empty result. */
export const entitySlugSchema = z
  .string()
  .max(NAME_MAX)
  .transform((value) => slugifyName(value))
  .pipe(z.string().min(1));

export const sha256HexSchema = z
  .string()
  .trim()
  .max(NAME_MAX)
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
  .max(NAME_MAX)
  .transform((value) => value.trim() || "application/octet-stream");

export const httpUrlSchema = z
  .string()
  .trim()
  .max(URL_MAX)
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
  .max(URL_MAX)
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
  .max(NAME_MAX)
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

/** JSON payload: strings are cut at `BODY_MAX`, arrays at `ARRAY_MAX`, keys at `NAME_MAX`. */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string().max(BODY_MAX),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema).max(ARRAY_MAX),
    z.record(z.string().max(NAME_MAX), jsonValueSchema),
  ])
);

export const jsonObjectSchema = z.record(
  z.string().max(NAME_MAX),
  jsonValueSchema
);

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
    const parsed = parseTrimmedUuid(id);
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
  .array(z.string().max(NAME_MAX))
  .max(ARRAY_MAX)
  .transform((ids) => normalizeIdList(ids).map((id) => uuidSchema.parse(id)));

/**
 * The `version` of a Graph row the caller last read (#307). Sent as `expectedVersion` with an
 * update; a row that has moved on since is refused with `stale_version` and nothing is written.
 */
export const expectedVersionSchema = z.number().int().positive();

/**
 * Tail of the `stale_version` message (`<Entity> changed since you opened it`): the API derives its
 * message from it and the web app recognises a stale-edit error that lost its `data` crossing a
 * server-function boundary by it.
 */
export const STALE_VERSION_MESSAGE_SUFFIX = "changed since you opened it";
