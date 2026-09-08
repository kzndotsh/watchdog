import { LoadingRegion } from "@/shared/ui/loading-region";
import { PendingRegion } from "@/shared/ui/pending-region";
import {
  BoardSkeletonLayout,
  DossierEvidenceSkeletonLayout,
  DossierOverviewSkeletonLayout,
} from "@/shared/ui/skeletons";

export function dossierOverviewFallback() {
  return (
    <LoadingRegion label="Loading overview">
      <DossierOverviewSkeletonLayout />
    </LoadingRegion>
  );
}

export function dossierEvidenceFallback() {
  return (
    <LoadingRegion label="Loading evidence">
      <DossierEvidenceSkeletonLayout />
    </LoadingRegion>
  );
}

export function dossierTasksFallback() {
  return (
    <PendingRegion
      loading
      label="Loading tasks"
      fallback={
        <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <BoardSkeletonLayout />
        </div>
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      {null}
    </PendingRegion>
  );
}
