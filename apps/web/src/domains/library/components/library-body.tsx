import type { ComponentProps, ReactNode } from "react";

import { LibraryGrid } from "@/domains/library/components/library-grid";
import { cn } from "@/lib/utils";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { PendingRegion } from "@/shared/ui/pending-region";
import { LibraryContentSkeleton } from "@/shared/ui/skeletons";

export type LibraryBodyProps = {
  isPending: boolean;
  loadError: string | null;
  onRetry: () => void;
  isPlaceholder: boolean;
  totalCount: number;
  query: string;
  onClear: () => void;
  beforeGrid: ReactNode;
  groups: ComponentProps<typeof LibraryGrid>["groups"];
};

/** The grid's states: loading, load error, blank slate, no results, or the cards. */
export function LibraryBody({
  isPending,
  loadError,
  onRetry,
  isPlaceholder,
  totalCount,
  query,
  onClear,
  beforeGrid,
  groups,
}: LibraryBodyProps) {
  if (isPending) {
    return (
      <PendingRegion
        isLoading
        label="Loading the Library"
        fallback={<LibraryContentSkeleton />}
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
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        placeholderDeemphasisClass(isPlaceholder)
      )}
    >
      {beforeGrid}
      {groups.length === 0 ? (
        <EmptyState
          intent="no-results"
          items="entries"
          query={query}
          onClearFilters={onClear}
        />
      ) : (
        <LibraryGrid groups={groups} />
      )}
    </div>
  );
}
