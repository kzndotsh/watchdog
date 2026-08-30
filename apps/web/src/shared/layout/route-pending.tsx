import { Page, PageHeader } from "@/shared/layout/page";
import { PendingRegion } from "@/shared/ui/pending-region";
import { QueueSkeleton, StackBodySkeleton } from "@/shared/ui/skeletons";

export type RoutePendingVariant = "queue" | "stack";

/**
 * Shared route pendingComponent for data-bearing pages.
 * Keeps Page + PageHeader chrome (static shell); only the body slot skeletons.
 * Trail still paints from the route + Active Case cookie.
 *
 * - `queue` — Queue+Detail pages (Collect, Triage, …)
 * - `stack` — tabbed / dashboard-style pages (prefer omitting pending when loader is thin)
 */
export function RoutePending({
  variant = "queue",
}: {
  variant?: RoutePendingVariant;
} = {}) {
  return (
    <Page density={variant === "queue" ? "split" : undefined}>
      <PageHeader />
      <div className="min-h-0 flex-1 overflow-hidden">
        {variant === "queue" ? (
          <PendingRegion
            loading
            label="Loading queue"
            fallback={<QueueSkeleton rows={10} />}
          >
            {null}
          </PendingRegion>
        ) : (
          <PendingRegion
            loading
            label="Loading content"
            fallback={<StackBodySkeleton />}
          >
            {null}
          </PendingRegion>
        )}
      </div>
    </Page>
  );
}
