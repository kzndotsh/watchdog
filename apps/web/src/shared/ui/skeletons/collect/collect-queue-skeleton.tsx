import { cn } from "@/lib/utils";
import { CollectQueueSkeletonLayout } from "@/shared/ui/skeletons/collect/collect-queue-skeleton-layout";
import { COLLECT_QUEUE_SKELETON_ROW_COUNT } from "@/shared/ui/skeletons/constants";

export function CollectQueueSkeleton({
  rows = COLLECT_QUEUE_SKELETON_ROW_COUNT,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <CollectQueueSkeletonLayout rows={rows} />
    </div>
  );
}
