import { LoadingRegion } from "@/shared/ui/loading-region";
import { DossierOverviewSkeletonLayout } from "@/shared/ui/skeletons";

export function dossierOverviewFallback() {
  return (
    <LoadingRegion label="Loading overview">
      <DossierOverviewSkeletonLayout />
    </LoadingRegion>
  );
}
