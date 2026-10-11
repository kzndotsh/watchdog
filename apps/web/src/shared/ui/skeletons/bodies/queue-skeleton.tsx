import { cn } from "@/lib/utils";
import { QueueBodySkeletonLayout } from "@/shared/ui/skeletons/bodies/queue-body-skeleton-layout";

/** Queue-row skeleton for data-slot loading (RoutePending body, queue columns). */
export function QueueSkeleton({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <QueueBodySkeletonLayout rows={rows} />
    </div>
  );
}
