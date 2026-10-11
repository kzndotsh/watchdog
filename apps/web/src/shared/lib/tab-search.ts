import { z } from "zod";

/** The `.catch` fallback: an unusable value is no tab. */
const noTab = (): undefined => undefined;

/**
 * Zod search validation for a `?tab=` param: trims the value, maps a legacy name to its
 * current tab, and resolves anything else (unknown, blank, non-string) to `undefined`,
 * which the screen reads as its default tab. It never throws, so a stale or mistyped
 * link lands on a valid tab instead of an error page.
 */
export function tabSearchParam<
  const TTabs extends readonly [string, ...string[]],
>(tabs: TTabs, legacy: Readonly<Record<string, TTabs[number]>> = {}) {
  return z
    .preprocess((value) => {
      const slug = typeof value === "string" ? value.trim() : value;
      return typeof slug === "string" && Object.hasOwn(legacy, slug)
        ? legacy[slug]
        : slug;
    }, z.enum(tabs))
    .optional()
    .catch(noTab);
}
