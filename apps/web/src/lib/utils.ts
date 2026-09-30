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

export function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}
