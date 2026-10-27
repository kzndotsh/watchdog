import type { LibraryQuery } from "@/domains/library/lib/library-list";
import type { LibraryEntry } from "@/domains/library/types";
import { catalogIdMatchesSearch } from "@watchdog/schemas/cases";

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

/** The keys of the entries that take any of the input kinds (`buildInputKindIndex`'s sets, united). */
function keysTakingAny(
  kinds: readonly string[],
  kindIndex: ReadonlyMap<string, ReadonlySet<string>>
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const kind of kinds) {
    for (const key of kindIndex.get(kind) ?? []) keys.add(key);
  }
  return keys;
}

/**
 * The entries that pass the list's query: its filters (`libraryList`) and its search text. A
 * filter that is empty does not narrow; `kind` (a set of input kinds) keeps the entries that take
 * any of them ("start from what you have", through the input-kind index).
 */
export function filterLibraryEntries(
  entries: readonly LibraryEntry[],
  query: LibraryQuery,
  kindIndex: ReadonlyMap<string, ReadonlySet<string>>
): LibraryEntry[] {
  const { kind, readiness, thirdParty, commercialUse } = query.filters;
  const readinessSet = new Set<string>(readiness);
  const useSet = new Set<string>(commercialUse);
  const takingKind = kind.length === 0 ? null : keysTakingAny(kind, kindIndex);
  return entries.filter((entry) => {
    if (takingKind !== null && !takingKind.has(entry.key)) return false;
    if (!entryMatchesQuery(entry, query.q ?? "")) return false;
    if (readiness.length > 0 && !readinessSet.has(entry.readiness.state)) {
      return false;
    }
    if (thirdParty && !entry.isThirdParty) return false;
    return commercialUse.length === 0 || useSet.has(entry.commercialUse);
  });
}
