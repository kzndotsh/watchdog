import { cn } from "@/lib/utils";
import { JobDetailSkeleton } from "@/shared/ui/evidence-detail-skeleton";

/** Collect detail column — composes JobDetailSkeleton (PendingRegion owns LoadingRegion). */
export function CollectDetailSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <JobDetailSkeleton className="min-h-0 flex-1" />
    </div>
  );
}
