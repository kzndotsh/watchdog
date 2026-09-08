import { slugifyName } from "@watchdog/schemas";

/** Build an ILIKE contains pattern; strip user wildcards so %/_ stay literal. */
export function containsPattern(term: string): string | null {
  const cleaned = term.replaceAll(/[%_]/g, "").trim();
  if (cleaned.length === 0) return null;
  return `%${cleaned}%`;
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
