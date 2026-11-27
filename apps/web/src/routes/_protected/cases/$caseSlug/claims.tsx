import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { claimListView } from "@/domains/entities/claims/queries";
import { ClaimsPage } from "@/domains/entities/components/claims-page";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { claimList } from "@watchdog/domain/schemas/graph";

/** The Claims screen's view (ADR-0007): tier tab, filters, `q` and sort, a bad value dropped. */
const claimsSearchSchema = claimList.searchWith({});

const routeApi = getRouteApi("/_protected/cases/$caseSlug/claims");

function ClaimsRoute() {
  const search = routeApi.useSearch();
  const onSearchChange = usePatchSearch();
  return <ClaimsPage search={search} onSearchChange={onSearchChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/claims")({
  validateSearch: claimsSearchSchema,
  // The view lives in the URL and `useList` follows it: a filter or search never re-runs the loader.
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient, workCase }, location }) => {
    claimListView.warm(
      queryClient,
      { caseId: workCase.id },
      claimList.queryOf(claimsSearchSchema.parse(location.search))
    );
  },
  component: ClaimsRoute,
});
