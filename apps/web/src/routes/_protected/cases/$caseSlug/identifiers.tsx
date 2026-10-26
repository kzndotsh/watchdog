import { createFileRoute } from "@tanstack/react-router";

import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";
import { warmIdentifiersQueries } from "@/domains/entities/lib/prefetch-identifiers";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { identifierList } from "@watchdog/schemas/graph";
import type { ListSearch } from "@watchdog/schemas/shared";

const identifiersSearchSchema = identifierList.searchWith({});

/**
 * The Identifiers table's view (ADR-0007): filters, `q` and sort, a bad value dropped. Typed as
 * the list's search: `searchWith({})` alone types its output with the `Record<string, never>` of
 * an empty `ZodObject`, whose index signature would reach every route's merged search type.
 */
function validateIdentifiersSearch(
  raw: Record<string, unknown>
): ListSearch<typeof identifierList> {
  return identifiersSearchSchema.parse(raw);
}

function IdentifiersRoute() {
  const search = Route.useSearch();
  const onSearchChange = usePatchSearch();
  return <IdentifiersPage search={search} onSearchChange={onSearchChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/identifiers")(
  {
    validateSearch: validateIdentifiersSearch,
    // The view lives in the URL and `useList` follows it: a filter or search never re-runs the loader.
    loaderDeps: () => ({}),
    loader: ({ context: { queryClient, workCase }, location }) => {
      warmIdentifiersQueries(
        queryClient,
        workCase.id,
        validateIdentifiersSearch(location.search)
      );
    },
    component: IdentifiersRoute,
  }
);
