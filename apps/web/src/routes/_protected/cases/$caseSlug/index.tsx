import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { CaseOverview } from "@/domains/cases/components/case-overview";
import { warmCaseOverviewQueries } from "@/domains/cases/lib/prefetch-case-overview";
import { RouteError } from "@/shared/layout/route-error";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/");

function CaseOverviewPage() {
  const { workCase } = routeApi.useRouteContext();
  return <CaseOverview caseId={workCase.id} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/")({
  loader: ({ context: { queryClient, workCase } }) => {
    warmCaseOverviewQueries(queryClient, workCase.id);
  },
  errorComponent: RouteError,
  component: CaseOverviewPage,
});
