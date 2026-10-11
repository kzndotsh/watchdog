import { DashboardOverviewPanelsSkeletonLayout } from "@/shared/ui/skeletons/dashboard/dashboard-overview-panels-skeleton-layout";
import { MetricTilesSkeletonLayout } from "@/shared/ui/skeletons/dashboard/metric-tiles-skeleton-layout";

/** Dashboard overview — metric tiles + triage/due panels. */
export function DashboardOverviewSkeletonLayout() {
  return (
    <div className="flex flex-col gap-3">
      <MetricTilesSkeletonLayout />
      <DashboardOverviewPanelsSkeletonLayout />
    </div>
  );
}
