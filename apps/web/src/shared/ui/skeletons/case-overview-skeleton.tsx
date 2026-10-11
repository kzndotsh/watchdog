import { cn } from "@/lib/utils";
import { CaseOverviewSkeletonLayout } from "@/shared/ui/skeletons/case-overview-skeleton-layout";

/** Case overview — stat tile grid + activity column + settings sidebar. */
export function CaseOverviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <CaseOverviewSkeletonLayout />
    </div>
  );
}
