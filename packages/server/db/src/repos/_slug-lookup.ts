import { slugifyName } from "@watchdog/domain/schemas/shared";

/** Slugify for WHERE lookups (getBySlug, listSlugsInCase); blank → miss. */
export function slugForLookup(slug: string): string | undefined {
  const normalized = slugifyName(slug);
  return normalized === "" ? undefined : normalized;
}
