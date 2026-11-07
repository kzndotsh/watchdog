import { PendingRegion } from "@/shared/ui/pending-region";
import { BoardSkeletonLayout } from "@/shared/ui/skeletons";

export function dossierTasksFallback() {
  return (
    <PendingRegion
      isLoading
      label="Loading tasks"
      fallback={
        <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
          <BoardSkeletonLayout />
        </div>
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      {null}
    </PendingRegion>
  );
}
