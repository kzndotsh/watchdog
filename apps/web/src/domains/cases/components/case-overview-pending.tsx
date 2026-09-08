import { PendingRegion } from "@/shared/ui/pending-region";
import { CaseOverviewSkeleton } from "@/shared/ui/skeletons";

export function CaseOverviewPending() {
  return (
    <PendingRegion
      loading
      label="Loading case overview"
      fallback={<CaseOverviewSkeleton />}
    >
      {null}
    </PendingRegion>
  );
}
