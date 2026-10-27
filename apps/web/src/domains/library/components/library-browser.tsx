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
import { libraryList } from "@/domains/library/lib/library-list";
import type {
  LibrarySearch,
  LibrarySearchPatch,
} from "@/domains/library/lib/library-search";
import type { LibraryEntry } from "@/domains/library/types";
import { useBoundedList } from "@/shared/hooks/list/use-bounded-list";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { LIBRARY_MAIN_CLASS } from "@/shared/ui/library-shell";
import { LibraryRailSkeleton } from "@/shared/ui/skeletons/library/library-rail-skeleton";
import { opsOf } from "@watchdog/schemas/shared";

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
  const kindIndex = useMemo(() => buildInputKindIndex(entries), [entries]);
  const kindOptions = useMemo(() => inputKindOptions(kindIndex), [kindIndex]);
  const picks = useMemo(
    () => quickPickKinds(kindOptions, QUICK_PICK_COUNT),
    [kindOptions]
  );
  const categories = useMemo(() => libraryCategories(entries), [entries]);
  // The query is the list's canonical reading of the URL; the rows are the registry read the
  // page already holds, filtered here (a bounded list keeps its own data source).
  const query = useMemo(() => opsOf(libraryList).queryOf(search), [search]);
  const filtered = useMemo(
    () => filterLibraryEntries(entries, query, kindIndex),
    [entries, query, kindIndex]
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

  const list = useBoundedList(libraryList, {
    rows: filtered,
    getId: (entry) => entry.key,
    totalRows: entries.length,
    isPending,
    error: loadError,
    retry: onRetry,
    search,
    onSearchChange,
  });
  const display = useListDisplay("library");
  const handleClear = () => {
    // Clear filters also leaves the category: the empty view is the whole Library.
    const ops = opsOf(libraryList);
    onSearchChange({ ...ops.toSearch(ops.cleared(query)), cat: undefined });
  };
  const handlePickKind = (kind: string) => {
    const picked = query.filters.kind;
    list.controls.setFilter(
      "kind",
      picked.includes(kind)
        ? picked.filter((existing) => existing !== kind)
        : [...picked, kind]
    );
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
          list={list}
          display={display}
          kindOptions={kindOptions}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
          <LibraryBody
            isPending={isPending}
            loadError={loadError}
            onRetry={onRetry}
            isPlaceholder={isPlaceholder}
            totalCount={entries.length}
            query={query.q ?? ""}
            isCompact={display.density === "compact"}
            onClear={handleClear}
            beforeGrid={
              <>
                {keysError === null ? null : (
                  <FetchErrorAlert error={keysError} onRetry={onRetry} />
                )}
                <LibraryStartFromBanner
                  picks={picks}
                  selected={query.filters.kind}
                  onPick={handlePickKind}
                />
                <LibraryKeysBanner count={keyCount} />
              </>
            }
            groups={groups}
          />
        </div>
      </div>
    </div>
  );
}
