import { z } from "zod";

/** The `.catch` fallback: an unusable value is no tab. */
const noTab = (): undefined => undefined;

/**
 * Zod search validation for a `?tab=` param: trims the value and resolves anything that is
 * not a known tab (unknown, blank, non-string) to `undefined`, which the screen reads as its
 * default tab. It never throws, so a mistyped link lands on a valid tab instead of an error
 * page.
 */
export function tabSearchParam<
  const TTabs extends readonly [string, ...string[]],
>(tabs: TTabs) {
  return z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() : value),
      z.enum(tabs)
    )
    .optional()
    .catch(noTab);
}
