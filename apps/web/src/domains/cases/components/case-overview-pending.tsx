import { Suspense, type ReactNode } from "react";

import { PendingRegion } from "@/shared/ui/pending-region";
import { CaseOverviewSkeleton } from "@/shared/ui/skeletons";

export function CaseOverviewPending() {
  return (
    <PendingRegion
      loading
      label="Loading case overview"
      fallback={<CaseOverviewSkeleton />}
    >
      {null}
    </PendingRegion>
  );
}

export function CaseOverviewSuspense({ children }: { children: ReactNode }) {
  return <Suspense fallback={<CaseOverviewPending />}>{children}</Suspense>;
}
