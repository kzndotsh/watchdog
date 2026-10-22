import { useMemo } from "react";

import { LibraryBody } from "@/domains/library/components/library-body";
import {
  ALL_CATEGORIES,
  LibraryCategoryRail,
} from "@/domains/library/components/library-category-rail";
import { LibraryKeysBanner } from "@/domains/library/components/library-keys-banner";
import { LibraryStartFromBanner } from "@/domains/library/components/library-start-from-banner";
import { LibraryToolbar } from "@/domains/library/components/library-toolbar";
import {
  buildInputKindIndex,
  inputKindOptions,
  quickPickKinds,
} from "@/domains/library/lib/input-kinds";
import {
  groupLibraryEntries,
  libraryCategories,
  needsKeyCount,
} from "@/domains/library/lib/library-entries";
import { filterLibraryEntries } from "@/domains/library/lib/library-filters";
import {
  filtersFromSearch,
  searchPatchFromFilters,
  type LibrarySearch,
  type LibrarySearchPatch,
} from "@/domains/library/lib/library-search";
import type { LibraryEntry, LibraryFilters } from "@/domains/library/types";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { LIBRARY_MAIN_CLASS } from "@/shared/ui/library-shell";
import { LibraryRailSkeleton } from "@/shared/ui/skeletons";

const QUICK_PICK_COUNT = 5;

export type LibraryBrowserProps = {
  entries: readonly LibraryEntry[];
  isPending: boolean;
  isPlaceholder: boolean;
  loadError: string | null;
  /** The vault could not be read: keyed entries show Unavailable until a retry works. */
  keysError: string | null;
  onRetry: () => void;
  /** The URL's filters and category. */
  search: LibrarySearch;
  onSearchChange: (patch: LibrarySearchPatch) => void;
};

const CLEARED: LibrarySearchPatch = {
  q: undefined,
  kind: undefined,
  cat: undefined,
  status: undefined,
  third: undefined,
  use: undefined,
};

function countByCategory(
  entries: readonly LibraryEntry[]
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>([[ALL_CATEGORIES, entries.length]]);
  for (const entry of entries) {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  }
  return counts;
}

/**
 * The Library's card grid: category rail, search and filters, the two banners and the cards.
 * Every choice lives in the URL (`search`), so a link can open "what takes an email address".
 */
export function LibraryBrowser({
  entries,
  isPending,
  isPlaceholder,
  loadError,
  keysError,
  onRetry,
  search,
  onSearchChange,
}: LibraryBrowserProps) {
  const filters = useMemo(() => filtersFromSearch(search), [search]);
  const kindIndex = useMemo(() => buildInputKindIndex(entries), [entries]);
  const kindOptions = useMemo(() => inputKindOptions(kindIndex), [kindIndex]);
  const picks = useMemo(
    () => quickPickKinds(kindOptions, QUICK_PICK_COUNT),
    [kindOptions]
  );
  const categories = useMemo(() => libraryCategories(entries), [entries]);
  const filtered = useMemo(
    () =>
      filterLibraryEntries(
        entries,
        filters,
        filters.inputKind === null
          ? undefined
          : kindIndex.get(filters.inputKind)
      ),
    [entries, filters, kindIndex]
  );
  const counts = useMemo(() => countByCategory(filtered), [filtered]);
  // A category that no longer exists (a stale link) is All.
  const category = categories.some((c) => c.id === search.cat)
    ? (search.cat ?? null)
    : null;
  const groups = useMemo(
    () =>
      groupLibraryEntries(
        category === null
          ? filtered
          : filtered.filter((entry) => entry.category === category)
      ),
    [filtered, category]
  );
  const keyCount = useMemo(() => needsKeyCount(entries), [entries]);

  const handleFiltersChange = (next: LibraryFilters) => {
    onSearchChange(searchPatchFromFilters(next));
  };
  const handleClear = () => {
    onSearchChange(CLEARED);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row lg:gap-0">
      {isPending ? (
        <LibraryRailSkeleton />
      ) : (
        <LibraryCategoryRail
          categories={categories}
          counts={counts}
          selected={category}
          onSelect={(next) => {
            onSearchChange({ cat: next ?? undefined });
          }}
        />
      )}
      <div className={LIBRARY_MAIN_CLASS}>
        <LibraryToolbar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          kindOptions={kindOptions}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <LibraryBody
            isPending={isPending}
            loadError={loadError}
            onRetry={onRetry}
            isPlaceholder={isPlaceholder}
            totalCount={entries.length}
            query={filters.q}
            onClear={handleClear}
            beforeGrid={
              <>
                {keysError === null ? null : (
                  <FetchErrorAlert error={keysError} onRetry={onRetry} />
                )}
                <LibraryStartFromBanner
                  picks={picks}
                  selected={filters.inputKind}
                  onPick={(kind) => {
                    onSearchChange({ kind: kind ?? undefined });
                  }}
                />
                <LibraryKeysBanner count={keyCount} />
              </>
            }
            groups={groups}
            isSectioned={category === null}
          />
        </div>
      </div>
    </div>
  );
}
