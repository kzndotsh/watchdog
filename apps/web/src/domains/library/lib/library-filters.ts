import type { LibraryEntry, LibraryFilters } from "@/domains/library/types";
import { catalogIdMatchesSearch } from "@watchdog/schemas/cases";

export function isLibraryFiltered(filters: LibraryFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    filters.inputKind !== null ||
    filters.readiness.length > 0 ||
    filters.isThirdPartyOnly ||
    filters.commercialUse.length > 0
  );
}

/** Search over title, id (raw and humanized), provider names and description. */
export function entryMatchesQuery(entry: LibraryEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  return (
    entry.title.toLowerCase().includes(q) ||
    catalogIdMatchesSearch(entry.id, q) ||
    entry.providers.some((name) => name.toLowerCase().includes(q)) ||
    entry.description.toLowerCase().includes(q)
  );
}

/**
 * The entries that pass every filter. `kindKeys` is the input-kind index's set for the chosen
 * kind (`buildInputKindIndex`), so "start from what you have" lists exactly what takes it.
 */
export function filterLibraryEntries(
  entries: readonly LibraryEntry[],
  filters: LibraryFilters,
  kindKeys: ReadonlySet<string> | undefined
): LibraryEntry[] {
  const readiness = new Set<string>(filters.readiness);
  const commercialUse = new Set<string>(filters.commercialUse);
  return entries.filter((entry) => {
    if (filters.inputKind !== null && !kindKeys?.has(entry.key)) return false;
    if (!entryMatchesQuery(entry, filters.q)) return false;
    if (readiness.size > 0 && !readiness.has(entry.readiness.state)) {
      return false;
    }
    if (filters.isThirdPartyOnly && !entry.isThirdParty) return false;
    return commercialUse.size === 0 || commercialUse.has(entry.commercialUse);
  });
}
