import { useSuspenseQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Suspense } from "react";

import { CaseGraphCanvas } from "@/domains/cases/components/case-graph/case-graph-canvas";
import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { edgesForCaseQuery } from "@/domains/entities/edges/queries";
import { entitiesListQuery } from "@/domains/entities/queries";
import { Page, PageHeader } from "@/shared/layout/page";
import { EmptyState } from "@/shared/ui/empty-state";
import { GraphCanvasLoadingRegion } from "@/shared/ui/graph/graph-canvas-skeleton";

function GraphCanvasBody({
  caseId,
  className,
}: {
  caseId: string;
  className?: string;
}) {
  const [{ data: entities }, { data: edges }] = useSuspenseQueries({
    queries: [entitiesListQuery(caseId), edgesForCaseQuery(caseId)],
  });

  return (
    <CaseGraphCanvas entities={entities} edges={edges} className={className} />
  );
}

function GraphActive({ active }: { active: CaseRecord }) {
  return (
    <Page density="split" className="gap-3">
      <PageHeader />
      <Suspense
        fallback={
          <GraphCanvasLoadingRegion
            className="min-h-0 flex-1"
            label="Loading graph"
          />
        }
      >
        <GraphCanvasBody caseId={active.id} className="min-h-0 flex-1" />
      </Suspense>
    </Page>
  );
}

export function GraphPage() {
  const [{ data: casesCtx }] = useSuspenseQueries({
    queries: [casesContextQuery()],
  });

  if (!casesCtx.active) {
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

  return <GraphActive active={casesCtx.active} />;
}
