import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";

import { CaseGraphCanvas } from "@/domains/cases/components/case-graph/case-graph-canvas";
import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { graphSnapshotQuery } from "@/domains/entities/edges/queries";
import { cn } from "@/lib/utils";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { GraphCanvasLoadingRegion } from "@/shared/ui/graph/graph-canvas-loading-region";

// Only a cut snapshot shows it: its chunk (and the counts read) loads then, not with the route.
const LazyGraphTruncationNotice = lazy(async () => {
  const { GraphTruncationNotice } =
    await import("@/domains/cases/components/graph-truncation-notice");
  return { default: GraphTruncationNotice };
});

function GraphCanvasBody({
  caseId,
  className,
}: {
  caseId: string;
  className?: string;
}) {
  const snapshotQuery = useQuery(graphSnapshotQuery(caseId));
  const snapshot = snapshotQuery.data;
  const graphPending = listPending(snapshotQuery);
  const graphLoadError = queryLoadError(
    snapshotQuery,
    graphPending,
    "Failed to load graph"
  );

  if (graphLoadError) {
    return (
      <FetchErrorAlert
        error={graphLoadError}
        onRetry={() => {
          void snapshotQuery.refetch();
        }}
      />
    );
  }

  if (graphPending || snapshot === undefined) {
    return (
      <GraphCanvasLoadingRegion
        className={className ?? "min-h-0 flex-1"}
        label="Loading graph"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col gap-2",
        placeholderDeemphasisClass(snapshotQuery.isPlaceholderData)
      )}
    >
      {snapshot.isTruncated ? (
        <Suspense fallback={null}>
          <LazyGraphTruncationNotice caseId={caseId} snapshot={snapshot} />
        </Suspense>
      ) : null}
      <CaseGraphCanvas
        entities={snapshot.entities}
        edges={snapshot.edges}
        className={className}
      />
    </div>
  );
}

function GraphActive({ active }: { active: CaseRecord }) {
  return (
    <Page density="split" className="gap-3">
      <PageHeader />
      <GraphCanvasBody caseId={active.id} className="min-h-0 flex-1" />
    </Page>
  );
}

export function GraphPage() {
  const active = useLiveWorkCase();

  return <GraphActive active={active} />;
}
