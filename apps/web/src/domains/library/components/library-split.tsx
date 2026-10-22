import { useMemo, useState } from "react";

import { LibraryDetail } from "@/domains/library/components/library-detail";
import { LibraryQueueBody } from "@/domains/library/components/library-queue-body";
import { LibraryQueueToolbar } from "@/domains/library/components/library-queue-toolbar";
import {
  buildInputKindIndex,
  inputKindOptions,
} from "@/domains/library/lib/input-kinds";
import { groupLibraryEntries } from "@/domains/library/lib/library-entries";
import { filterLibraryEntries } from "@/domains/library/lib/library-filters";
import {
  EMPTY_LIBRARY_FILTERS,
  type LibraryEntry,
  type LibraryFilters,
} from "@/domains/library/types";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import { SplitView } from "@/shared/ui/split-view";

type LocalFilters = Omit<LibraryFilters, "inputKind">;

export type LibrarySplitProps = {
  entries: readonly LibraryEntry[];
  isPending: boolean;
  isPlaceholder: boolean;
  loadError: string | null;
  /** The vault could not be read: keyed entries show Unavailable until a retry works. */
  keysError: string | null;
  onRetry: () => void;
  /** Selected entry key (`cap:<id>` / `playbook:<id>`), from the URL. */
  selectedKey?: string;
  /** "Start from what you have": the input kind, from the URL. */
  inputKind?: string;
  onSelectedKeyChange: (next: string | null) => void;
  onInputKindChange: (next: string | null) => void;
};

/**
 * Queue + Detail for the Library. Search and the facet filters are local state; the input
 * kind and the selection live in the URL, so a link can open "what takes an email address".
 */
export function LibrarySplit({
  entries,
  isPending,
  isPlaceholder,
  loadError,
  keysError,
  onRetry,
  selectedKey,
  inputKind,
  onSelectedKeyChange,
  onInputKindChange,
}: LibrarySplitProps) {
  const [local, setLocal] = useState<LocalFilters>(EMPTY_LIBRARY_FILTERS);
  const filters = useMemo<LibraryFilters>(
    () => ({ ...local, inputKind: inputKind ?? null }),
    [local, inputKind]
  );

  const kindIndex = useMemo(() => buildInputKindIndex(entries), [entries]);
  const kindOptions = useMemo(() => inputKindOptions(kindIndex), [kindIndex]);
  const groups = useMemo(
    () =>
      groupLibraryEntries(
        filterLibraryEntries(
          entries,
          filters,
          filters.inputKind === null
            ? undefined
            : kindIndex.get(filters.inputKind)
        )
      ),
    [entries, filters, kindIndex]
  );
  const visibleCount = groups.reduce(
    (sum, group) => sum + group.entries.length,
    0
  );
  const selected = entries.find((entry) => entry.key === selectedKey) ?? null;

  const handleFiltersChange = (next: LibraryFilters) => {
    const { inputKind: nextKind, ...rest } = next;
    setLocal(rest);
    if (nextKind !== filters.inputKind) onInputKindChange(nextKind);
  };
  const handleRetry = onRetry;

  return (
    <>
      <LibraryQueueToolbar
        filters={filters}
        onFiltersChange={handleFiltersChange}
        kindOptions={kindOptions}
      />
      <SplitView
        groupId="library"
        backLabel="Library"
        list={
          <QueueShell
            aria-label="Library"
            isScrollable={!isPending}
            header={
              <QueueHeader
                label="Caps and Playbooks"
                count={isPending ? undefined : visibleCount}
              />
            }
          >
            <LibraryQueueBody
              isPending={isPending}
              loadError={loadError}
              keysError={keysError}
              onRetry={handleRetry}
              isPlaceholder={isPlaceholder}
              totalCount={entries.length}
              groups={groups}
              filters={filters}
              selectedKey={selected?.key ?? null}
              onFiltersChange={handleFiltersChange}
              onSelect={onSelectedKeyChange}
            />
          </QueueShell>
        }
        detail={<LibraryDetail entry={selected} />}
      />
    </>
  );
}
