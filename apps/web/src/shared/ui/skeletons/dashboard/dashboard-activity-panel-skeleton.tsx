import { cn } from "@/lib/utils";
import { DashboardActivitySkeletonLayout } from "@/shared/ui/skeletons/dashboard/dashboard-activity-skeleton-layout";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Full activity column — header chrome + scrollable feed rows. */
export function DashboardActivityPanelSkeleton({
  className,
}: {
  className?: string;
}) {
  return (
    <section
      className={cn("flex h-full min-h-0 flex-col gap-2", className)}
      aria-hidden
    >
      <div className="flex min-h-7 shrink-0 items-center justify-between gap-2">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-7 w-[11rem] rounded-md" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden pr-3">
        <DashboardActivitySkeletonLayout />
      </div>
    </section>
  );
}
