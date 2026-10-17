import { createFileRoute, getRouteApi, redirect } from "@tanstack/react-router";

import { CaseOverview } from "@/domains/cases/components/case-overview";
import {
  CASE_LEGACY_TAB_REDIRECT,
  caseOverviewSearchSchema,
} from "@/domains/cases/lib/case-legacy-tabs";
import { warmCaseOverviewQueries } from "@/domains/cases/lib/prefetch-case-overview";
import { RouteError } from "@/shared/layout/route-error";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/");

function CaseOverviewPage() {
  const { workCase } = routeApi.useRouteContext();
  return <CaseOverview caseId={workCase.id} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/")({
  validateSearch: caseOverviewSearchSchema,
  loaderDeps: ({ search }) => ({ tab: search.tab }),
  loader: ({ context: { queryClient, workCase }, params, deps }) => {
    // Legacy overview tabs → first-class Work routes of the same Case.
    if (deps.tab) {
      // oxlint-disable-next-line typescript/only-throw-error -- TanStack Router redirect() throws
      throw redirect({
        to: CASE_LEGACY_TAB_REDIRECT[deps.tab],
        params: { caseSlug: params.caseSlug },
        replace: true,
      });
    }

    warmCaseOverviewQueries(queryClient, workCase.id);
  },
  errorComponent: RouteError,
  component: CaseOverviewPage,
});
