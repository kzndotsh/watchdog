import { PaperclipIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EVIDENCE_PICKER_TRIGGER_CLASS } from "@/shared/ui/intake/evidence-picker-trigger-class";
import { LoadingRegion } from "@/shared/ui/loading-region";
import { WithTooltip } from "@/shared/ui/with-tooltip";
import { Skeleton } from "@watchdog/ui/components/skeleton";

type EvidenceSlotSkeletonProps = {
  mode: "cite" | "pick";
  citeCount?: number;
  className?: string;
};

/** Loading shell beside confidence — matches picker trigger or cite chips. */
export function EvidenceSlotSkeleton({
  mode,
  citeCount = 1,
  className,
}: EvidenceSlotSkeletonProps) {
  if (mode === "cite") {
    const count = Math.max(citeCount, 1);
    return (
      <LoadingRegion
        label="Loading evidence"
        className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
      >
        <WithTooltip content="Evidence" wrapSpan className="inline-flex">
          <PaperclipIcon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
        </WithTooltip>
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="h-5 w-24 rounded-md" />
        ))}
      </LoadingRegion>
    );
  }

  return (
    <LoadingRegion
      label="Loading evidence"
      className={cn("flex min-w-0 items-center", className)}
    >
      <Skeleton
        className={cn(EVIDENCE_PICKER_TRIGGER_CLASS, "w-14 border-dashed")}
      />
    </LoadingRegion>
  );
}
