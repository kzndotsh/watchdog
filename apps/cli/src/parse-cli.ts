import type { z } from "zod";

import { nullableTrimmedPatchSchema } from "@watchdog/schemas";

import { fail } from "./io";

/** Parse a required CLI enum/string schema with a USAGE error on failure. */
export function parseCliEnum<T>(
  schema: z.ZodType<T>,
  value: string,
  label: string,
  help?: string[]
): T {
  const parsed = schema.safeParse(value.trim());
  if (!parsed.success) {
    fail("USAGE", `Invalid ${label}`, { help: help ?? ["wd --help"] });
  }
  return parsed.data;
}

/** Parse an optional CLI enum when the flag was provided (blank → undefined). */
export function parseOptionalCliEnum<T>(
  schema: z.ZodType<T>,
  value: string | undefined,
  label: string,
  help?: string[]
): T | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === "") return undefined;
  return parseCliEnum(schema, trimmed, label, help);
}

/** PATCH field: omit = no change; blank = clear; non-blank = set (trimmed). */
export function parseOptionalNullableTrimmedPatch(
  value: string | undefined
): string | null | undefined {
  if (value === undefined) return undefined;
  return nullableTrimmedPatchSchema.parse(value);
}
