import type { ReactNode } from "react";

import { CollectQueueList } from "@/domains/collect/components/collect-queue-list";
import {
  EMPTY_COLLECT_FILTERS,
  type CollectFilters,
  type CollectRow,
} from "@/domains/collect/types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import {
  CollectQueueSkeleton,
  COLLECT_QUEUE_SKELETON_ROW_COUNT,
} from "@/shared/ui/skeletons";

export interface CollectQueueBodyProps {
  queuePending: boolean;
  queueLoadError: string | null;
  onRetryQueue: () => void;
  queuePlaceholder: boolean;
  indexRows: readonly CollectRow[];
  visibleRows: readonly CollectRow[];
  filters: CollectFilters;
  selectionRowId: string | null;
  blankSlateAction: ReactNode;
  onFiltersChange: (next: CollectFilters) => void;
  onIdChange: (next: string | null) => void;
}

export function CollectQueueBody({
  queuePending,
  queueLoadError,
  onRetryQueue,
  queuePlaceholder,
  indexRows,
  visibleRows,
  filters,
  selectionRowId,
  blankSlateAction,
  onFiltersChange,
  onIdChange,
}: CollectQueueBodyProps) {
  if (queueLoadError !== null) {
    return <FetchErrorAlert error={queueLoadError} onRetry={onRetryQueue} />;
  }
  if (!queuePending && indexRows.length === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="items"
        description="Dump evidence or run a Cap/Playbook."
        action={blankSlateAction}
      />
    );
  }
  if (!queuePending && visibleRows.length === 0) {
    return (
      <EmptyState
        intent="no-results"
        items="items"
        query={filters.q}
        onClearFilters={() => {
          onFiltersChange(EMPTY_COLLECT_FILTERS);
        }}
      />
    );
  }
  return (
    <PendingRegion
      loading={queuePending}
      label="Loading collect queue"
      fallback={
        <CollectQueueSkeleton rows={COLLECT_QUEUE_SKELETON_ROW_COUNT} />
      }
    >
      <div className={placeholderDeemphasisClass(queuePlaceholder)}>
        <CollectQueueList
          rows={visibleRows}
          selectedId={selectionRowId}
          onSelect={onIdChange}
        />
      </div>
    </PendingRegion>
  );
}
