import { slugifyName } from "@watchdog/schemas/shared";

/**
 * Build an ILIKE contains pattern for a user term: trimmed, with `\`, `%` and `_` escaped (LIKE's
 * default escape character is `\`), so the term matches literally: `50%` finds "50% off", never
 * "500 off". `null` for a blank term.
 */
export function containsPattern(term: string): string | null {
  const cleaned = term.trim();
  if (cleaned.length === 0) return null;
  return `%${cleaned.replaceAll(/[\\%_]/g, String.raw`\$&`)}%`;
}

/**
 * An ILIKE pattern that matches the whole value, ignoring case: trimmed, with `\`, `%` and `_`
 * escaped, so `50%` matches "50%" and never "500". `null` for a blank term.
 */
export function exactPattern(term: string): string | null {
  const cleaned = term.trim();
  if (cleaned.length === 0) return null;
  return cleaned.replaceAll(/[\\%_]/g, String.raw`\$&`);
}

/** Slug search pattern when slugified text differs from the raw contains pattern. */
export function distinctSlugContainsPattern(
  term: string,
  slugifiedTerm: string
): string | null {
  const raw = containsPattern(term);
  const slug = containsPattern(slugifiedTerm);
  if (slug === null || slug === raw) return null;
  return slug;
}

/** Raw + slugified ILIKE patterns for `entity.slug` / `case.slug` search. */
export function entitySlugIlikePatterns(term: string): readonly string[] {
  const pattern = containsPattern(term);
  if (pattern === null) return [];
  const slugPattern = distinctSlugContainsPattern(term, slugifyName(term));
  return slugPattern ? [pattern, slugPattern] : [pattern];
}
