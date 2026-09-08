import type { IdentifierType } from "@watchdog/schemas";

import { validatedIdentifierValue } from "./validated-identifier-value";

/** Drop values that normalize to the same identifier as the query seed. */
export function filterRelatedIdentifiers(
  type: IdentifierType,
  seed: string,
  values: readonly string[]
): string[] {
  const seedValue = validatedIdentifierValue(type, seed);
  if (seedValue === null) return [...values];
  return values.filter((raw) => {
    const value = validatedIdentifierValue(type, raw);
    return value !== null && value !== seedValue;
  });
}
