import { createFileRoute } from "@tanstack/react-router";

import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";
import { warmIdentifiersQueries } from "@/domains/entities/lib/prefetch-identifiers";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { identifierList } from "@watchdog/schemas/graph";

/** The Identifiers table's view (ADR-0007): filters, `q` and sort, a bad value dropped. */
const identifiersSearchSchema = identifierList.searchWith({});

function IdentifiersRoute() {
  const search = Route.useSearch();
  const onSearchChange = usePatchSearch();
  return <IdentifiersPage search={search} onSearchChange={onSearchChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/identifiers")(
  {
    validateSearch: identifiersSearchSchema,
    // The view lives in the URL and `useList` follows it: a filter or search never re-runs the loader.
    loaderDeps: () => ({}),
    loader: ({ context: { queryClient, workCase }, location }) => {
      warmIdentifiersQueries(
        queryClient,
        workCase.id,
        identifiersSearchSchema.parse(location.search)
      );
    },
    component: IdentifiersRoute,
  }
);
