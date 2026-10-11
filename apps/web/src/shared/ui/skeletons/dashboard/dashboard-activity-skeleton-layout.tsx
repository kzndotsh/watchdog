import { DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT } from "@/shared/ui/skeletons/constants";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Activity feed rows — mirrors RecentActivity list items. */
export function DashboardActivitySkeletonLayout({
  rows = DASHBOARD_ACTIVITY_SKELETON_ROW_COUNT,
}: {
  rows?: number;
}) {
  return (
    <ul className="divide-border divide-y" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i}>
          <div className="flex flex-wrap items-start justify-between gap-2 px-0 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-3/4 max-w-sm" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-10 shrink-0" />
          </div>
        </li>
      ))}
    </ul>
  );
}
