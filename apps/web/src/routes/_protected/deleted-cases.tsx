import { createFileRoute } from "@tanstack/react-router";

import { DeletedCasesPage } from "@/domains/cases/components/deleted-cases-page";
import { warmDeletedCases } from "@/domains/cases/lib/prefetch-deleted-cases";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { RouteError } from "@/shared/layout/route-error";
import { deletedCaseList } from "@watchdog/schemas/cases";

/** The Deleted Cases view (ADR-0007): filters, `q` and sort, a bad value dropped. */
const deletedCasesSearchSchema = deletedCaseList.searchWith({});

function DeletedCasesRoute() {
  const search = Route.useSearch();
  const onSearchChange = usePatchSearch();
  return <DeletedCasesPage search={search} onSearchChange={onSearchChange} />;
}

/** Deleted Cases: restore a deleted Case or purge it now (owners and admins). */
export const Route = createFileRoute("/_protected/deleted-cases")({
  validateSearch: deletedCasesSearchSchema,
  // The view lives in the URL and `useList` follows it: a filter or search never re-runs the loader.
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient }, location }) => {
    void warmDeletedCases(
      queryClient,
      deletedCasesSearchSchema.parse(location.search)
    );
  },
  errorComponent: RouteError,
  component: DeletedCasesRoute,
});
