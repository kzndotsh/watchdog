import { LibraryQueueList } from "@/domains/library/components/library-queue-list";
import {
  EMPTY_LIBRARY_FILTERS,
  type LibraryFilters,
  type LibraryGroup,
} from "@/domains/library/types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import { QueueSkeleton } from "@/shared/ui/skeletons";

export type LibraryQueueBodyProps = {
  isPending: boolean;
  loadError: string | null;
  keysError: string | null;
  onRetry: () => void;
  isPlaceholder: boolean;
  totalCount: number;
  groups: readonly LibraryGroup[];
  filters: LibraryFilters;
  selectedKey: string | null;
  onFiltersChange: (next: LibraryFilters) => void;
  onSelect: (key: string) => void;
};

export function LibraryQueueBody({
  isPending,
  loadError,
  keysError,
  onRetry,
  isPlaceholder,
  totalCount,
  groups,
  filters,
  selectedKey,
  onFiltersChange,
  onSelect,
}: LibraryQueueBodyProps) {
  if (isPending) {
    return (
      <PendingRegion
        isLoading
        label="Loading the Library"
        fallback={<QueueSkeleton rows={8} />}
      >
        {null}
      </PendingRegion>
    );
  }
  if (loadError !== null) {
    return <FetchErrorAlert error={loadError} onRetry={onRetry} />;
  }
  if (totalCount === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="entries"
        description="This server has no Caps or Playbooks registered."
      />
    );
  }
  if (groups.length === 0) {
    return (
      <EmptyState
        intent="no-results"
        items="entries"
        query={filters.q}
        onClearFilters={() => {
          onFiltersChange(EMPTY_LIBRARY_FILTERS);
        }}
      />
    );
  }
  return (
    <div className={placeholderDeemphasisClass(isPlaceholder)}>
      {keysError === null ? null : (
        <FetchErrorAlert error={keysError} onRetry={onRetry} />
      )}
      <LibraryQueueList
        groups={groups}
        selectedKey={selectedKey}
        onSelect={onSelect}
      />
    </div>
  );
}
