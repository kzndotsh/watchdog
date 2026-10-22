import { redirect } from "@tanstack/react-router";
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

/**
 * The Library's URL state. `id` is the retired `?id=cap:x` selection, kept only so old links
 * can redirect to the entry's page; everything else is a filter, so a link can open "what
 * takes an email address".
 */
export const librarySearchSchema = z.object({
  id: token,
  q: token,
  kind: token,
  cat: token,
  status: knownList<LibraryReadinessState>(LIBRARY_READINESS_STATES),
  third: flag,
  use: knownList<CommercialUse>(COMMERCIAL_USE_VALUES),
});

export type LibrarySearch = z.output<typeof librarySearchSchema>;

/** What a filter change writes back: only the keys that changed. */
export type LibrarySearchPatch = Partial<Omit<LibrarySearch, "id">>;

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

/** Where an old `?id=cap:<id>` / `?id=playbook:<id>` link now lives, or null. */
export function entryPathFromKey(key: string | undefined): string | null {
  if (key === undefined) return null;
  const sep = key.indexOf(":");
  const kind = key.slice(0, sep);
  const id = key.slice(sep + 1);
  if (sep < 1 || id === "") return null;
  if (kind === "cap") return `/library/caps/${encodeURIComponent(id)}`;
  if (kind === "playbook") {
    return `/library/playbooks/${encodeURIComponent(id)}`;
  }
  return null;
}

/**
 * An old `?id=cap:<id>` / `?id=playbook:<id>` link opens that entry's page: throws the
 * redirect for one, returns for anything else.
 */
export function redirectLegacyEntry(search: Pick<LibrarySearch, "id">): void {
  const href = entryPathFromKey(search.id);
  if (href !== null) {
    // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router's redirect() throws a Response, per docs
    throw redirect({ href, replace: true });
  }
}
