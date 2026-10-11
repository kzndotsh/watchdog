import { cn } from "@/lib/utils";
import { DASHBOARD_METRIC_TILE_COUNT } from "@/shared/ui/skeletons/constants";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Metric tile grid — shared by dashboard overview and case overview. */
export function MetricTilesSkeletonLayout({
  count = DASHBOARD_METRIC_TILE_COUNT,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <section
      aria-hidden
      className={cn("grid shrink-0 grid-cols-3 gap-2", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1 rounded-md px-3 py-2.5">
          <Skeleton className="h-8 w-12" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </section>
  );
}
