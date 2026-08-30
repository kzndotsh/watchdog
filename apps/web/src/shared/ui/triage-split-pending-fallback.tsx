import { PendingRegion } from "@/shared/ui/pending-region";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import { QueueSkeleton } from "@/shared/ui/skeletons";
import { SplitView } from "@/shared/ui/split-view";
import { TriageDetailSkeleton } from "@/shared/ui/triage-detail-skeleton";

/** Triage split loading fallback — queue + detail skeletons with static chrome. */
export function TriageSplitPendingFallback() {
  return (
    <SplitView
      groupId="inbox"
      list={
        <QueueShell
          aria-label="Proposal queue"
          scrollable={false}
          header={<QueueHeader label="Queue" />}
        >
          <PendingRegion
            loading
            label="Loading triage queue"
            fallback={<QueueSkeleton rows={10} />}
          >
            {null}
          </PendingRegion>
        </QueueShell>
      }
      detail={
        <PendingRegion
          loading
          label="Loading triage detail"
          fallback={<TriageDetailSkeleton className="min-h-0 flex-1" />}
          className="flex h-full min-h-0 flex-col"
        >
          {null}
        </PendingRegion>
      }
    />
  );
}
