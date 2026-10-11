import { cn } from "@/lib/utils";
import { DashboardOverviewSkeletonLayout } from "@/shared/ui/skeletons/dashboard/dashboard-overview-skeleton-layout";

/** Dashboard overview — PendingRegion fallback for overview metrics + panels. */
export function DashboardOverviewSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <DashboardOverviewSkeletonLayout />
    </div>
  );
}
