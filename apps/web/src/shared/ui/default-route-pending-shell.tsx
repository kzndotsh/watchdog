import { PendingRegion } from "@/shared/ui/pending-region";
import { RoutePendingSkeletonLayout } from "@/shared/ui/skeletons";

/** Router defaultPendingComponent — header chrome + stack body skeleton. */
export function DefaultRoutePendingShell() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <PendingRegion
        loading
        label="Loading page"
        fallback={<RoutePendingSkeletonLayout />}
        className="flex h-full min-h-0 flex-col"
      >
        {null}
      </PendingRegion>
    </div>
  );
}
