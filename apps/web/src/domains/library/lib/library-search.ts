import { z } from "zod";

import {
  COMMERCIAL_USE_VALUES,
  LIBRARY_READINESS_STATES,
  type CommercialUse,
  type LibraryFilters,
  type LibraryReadinessState,
} from "@/domains/library/types";
import { trimmedOrUndefined } from "@watchdog/schemas/shared";

/** A short URL token: trimmed, blank is absent, junk is dropped. */
const token = z
  .unknown()
  .transform((value) =>
    typeof value === "string"
      ? trimmedOrUndefined(value)?.slice(0, 128)
      : undefined
  )
  .optional();

/** A list of known values; unknown entries are dropped and an empty list is absent. */
function knownList<T extends string>(allowed: readonly T[]) {
  return z
    .unknown()
    .transform((value) => {
      const given = new Set<unknown>(Array.isArray(value) ? value : []);
      const picked = allowed.filter((item) => given.has(item));
      return picked.length === 0 ? undefined : picked;
    })
    .optional();
}

const flag = z
  .unknown()
  .transform((value) => (value === true || value === "true" ? true : undefined))
  .optional();

/** The Library's URL state: every key is a filter, so a link can open "what takes an email address". */
export const librarySearchSchema = z.object({
  q: token,
  kind: token,
  cat: token,
  status: knownList<LibraryReadinessState>(LIBRARY_READINESS_STATES),
  third: flag,
  use: knownList<CommercialUse>(COMMERCIAL_USE_VALUES),
});

export type LibrarySearch = z.output<typeof librarySearchSchema>;

/** What a filter change writes back: only the keys that changed. */
export type LibrarySearchPatch = Partial<LibrarySearch>;

export function filtersFromSearch(search: LibrarySearch): LibraryFilters {
  return {
    q: search.q ?? "",
    inputKind: search.kind ?? null,
    readiness: search.status ?? [],
    isThirdPartyOnly: search.third === true,
    commercialUse: search.use ?? [],
  };
}

/** The search patch for a filter state: empty values become `undefined` so the URL stays short. */
export function searchPatchFromFilters(
  filters: LibraryFilters
): LibrarySearchPatch {
  return {
    q: filters.q === "" ? undefined : filters.q,
    kind: filters.inputKind ?? undefined,
    status: filters.readiness.length === 0 ? undefined : filters.readiness,
    third: filters.isThirdPartyOnly ? true : undefined,
    use: filters.commercialUse.length === 0 ? undefined : filters.commercialUse,
  };
}
