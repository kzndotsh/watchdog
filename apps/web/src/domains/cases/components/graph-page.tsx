import { useQuery } from "@tanstack/react-query";

import { CaseGraphCanvas } from "@/domains/cases/components/case-graph/case-graph-canvas";
import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { cn } from "@/lib/utils";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { GraphCanvasLoadingRegion } from "@/shared/ui/graph/graph-canvas-loading-region";

const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_EDGES: CaseEdgeRecord[] = [];

function GraphCanvasBody({
  caseId,
  className,
}: {
  caseId: string;
  className?: string;
}) {
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const edgesQuery = useQuery(edgesForCaseQuery(caseId));
  const graphPending = listPending(entitiesQuery) || listPending(edgesQuery);
  const graphLoadError = combinedQueryLoadError(
    [entitiesQuery, edgesQuery],
    graphPending,
    "Failed to load graph"
  );
  const graphPlaceholder =
    entitiesQuery.isPlaceholderData || edgesQuery.isPlaceholderData;

  if (graphLoadError) {
    return (
      <FetchErrorAlert
        error={graphLoadError}
        onRetry={() => {
          if (entitiesQuery.isError) void entitiesQuery.refetch();
          if (edgesQuery.isError) void edgesQuery.refetch();
        }}
      />
    );
  }

  if (graphPending) {
    return (
      <GraphCanvasLoadingRegion
        className={className ?? "min-h-0 flex-1"}
        label="Loading graph"
      />
    );
  }

  const entities = entitiesQuery.data ?? EMPTY_ENTITIES;
  const edges = edgesQuery.data ?? EMPTY_EDGES;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        placeholderDeemphasisClass(graphPlaceholder)
      )}
    >
      <CaseGraphCanvas
        entities={entities}
        edges={edges}
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
