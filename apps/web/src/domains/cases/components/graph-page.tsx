import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { CaseGraphCanvas } from "@/domains/cases/components/case-graph/case-graph-canvas";
import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import type { CaseEdgeRecord } from "@/domains/entities/edges/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { Page, PageHeader } from "@/shared/layout/page";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { invalidateAfterEntityChanged } from "@/shared/lib/query-invalidation";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { GraphCanvasLoadingRegion } from "@/shared/ui/graph/graph-canvas-skeleton";
import { stackPendingFallback } from "@/shared/ui/stack-pending-fallback";

const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_EDGES: CaseEdgeRecord[] = [];

function GraphCanvasBody({
  caseId,
  className,
}: {
  caseId: string;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const edgesQuery = useQuery(edgesForCaseQuery(caseId));
  const graphPending = listPending(entitiesQuery) || listPending(edgesQuery);
  const graphLoadError =
    !graphPending && (entitiesQuery.isError || edgesQuery.isError)
      ? errMessage(
          entitiesQuery.error ?? edgesQuery.error,
          "Failed to load graph"
        )
      : null;
  const graphPlaceholder =
    entitiesQuery.isPlaceholderData || edgesQuery.isPlaceholderData;

  useLiveEvents(caseId, (event) => {
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(queryClient, caseId);
    }
  });

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
    <div className={placeholderDeemphasisClass(graphPlaceholder)}>
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
  const { active, pending, loadError, retry } = useCasesContext();

  if (loadError) {
    return (
      <Page>
        <PageHeader />
        <FetchErrorAlert error={loadError} onRetry={retry} />
      </Page>
    );
  }

  if (pending) {
    return (
      <Page>
        <PageHeader />
        {stackPendingFallback(1)}
      </Page>
    );
  }

  if (!active) {
    return (
      <Page>
        <PageHeader />
        <EmptyState
          intent="blank-slate"
          items="cases"
          title="No active case"
          description={
            <>
              <Link to="/cases" className="underline">
                Select a case
              </Link>{" "}
              to view the graph.
            </>
          }
        />
      </Page>
    );
  }

  return <GraphActive active={active} />;
}
