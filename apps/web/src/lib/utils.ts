import { slugifyName as schemaSlugifyName } from "@watchdog/schemas";

export { cn } from "cn";

export function slugifyName(name: string): string {
  return schemaSlugifyName(name);
}

/** Keep slug in lockstep with name until the user edits it. */
export function nextAutoSlug(
  previousName: string,
  previousSlug: string,
  nextName: string
): string | null {
  const stillAuto = !previousSlug || previousSlug === slugifyName(previousName);
  return stillAuto ? slugifyName(nextName) : null;
}

/**
 * The first string with visible characters, or `undefined` if none. Use it for display
 * fallbacks: unlike `??` it skips `""` (an unnamed API key, an empty IP), and unlike `||`
 * it is explicit about strings only.
 */
export function firstNonEmpty(
  ...values: readonly (string | null | undefined)[]
): string | undefined {
  return values.find(
    (value): value is string => typeof value === "string" && value.trim() !== ""
  );
}

/** A Better Auth / fetch error message, or `fallback` when it is missing or empty. */
export function messageOr(
  message: string | null | undefined,
  fallback: string
): string {
  return message === undefined || message === null || message === ""
    ? fallback
    : message;
}

export function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
