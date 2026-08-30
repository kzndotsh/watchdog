import { PendingRegion } from "@/shared/ui/pending-region";
import { StackBodySkeleton } from "@/shared/ui/skeletons";

export function stackPendingFallback(sections?: number) {
  return (
    <PendingRegion
      loading
      label="Loading content"
      fallback={<StackBodySkeleton sections={sections} />}
    >
      {null}
    </PendingRegion>
  );
}
