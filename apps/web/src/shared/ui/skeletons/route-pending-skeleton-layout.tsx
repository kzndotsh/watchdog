import { StackBodySkeletonLayout } from "@/shared/ui/skeletons/bodies/stack-body-skeleton-layout";
import { Skeleton } from "@watchdog/ui/components/skeleton";

export function RoutePendingSkeletonLayout() {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border shrink-0 border-b px-6 py-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        <StackBodySkeletonLayout sections={2} />
      </div>
    </div>
  );
}
