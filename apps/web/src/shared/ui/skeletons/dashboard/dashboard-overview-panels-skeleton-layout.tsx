import { cn } from "@/lib/utils";
import { Skeleton } from "@watchdog/ui/components/skeleton";

function DashboardPanelSkeleton({
  titleWidth = "w-12",
}: {
  titleWidth?: string;
}) {
  return (
    <section className="space-y-3" aria-hidden>
      <div className="flex min-h-6 shrink-0 items-center justify-between gap-2">
        <Skeleton className={cn("h-5", titleWidth)} />
        <Skeleton className="h-4 w-10" />
      </div>
      <ul className="border-border divide-border divide-y overflow-hidden rounded-md border">
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
              <Skeleton className="h-4 min-w-0 flex-1" />
              <Skeleton className="h-3 w-12 shrink-0" />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Dashboard overview — triage/due panels under the metric tiles. */
export function DashboardOverviewPanelsSkeletonLayout() {
  return (
    <div className="grid min-h-0 gap-6 lg:grid-cols-2 lg:items-start">
      <DashboardPanelSkeleton titleWidth="w-12" />
      <DashboardPanelSkeleton titleWidth="w-8" />
    </div>
  );
}
