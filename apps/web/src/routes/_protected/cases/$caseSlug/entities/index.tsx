import { createFileRoute } from "@tanstack/react-router";

import { EntityTable } from "@/domains/entities/components/entity-table";
import { warmEntitiesQueries } from "@/domains/entities/lib/prefetch-entities";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";
import { entityList } from "@watchdog/schemas/graph";

/** The Entities table's view (ADR-0007): the Kind filter, `q` and sort, a bad value dropped. */
const entitiesSearchSchema = entityList.searchWith({});

function EntitiesRoute() {
  const search = Route.useSearch();
  const onSearchChange = usePatchSearch();
  return <EntityTable search={search} onSearchChange={onSearchChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/entities/")({
  validateSearch: entitiesSearchSchema,
  // The view lives in the URL and `useList` follows it: a filter or search never re-runs the loader.
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient, workCase }, location }) => {
    warmEntitiesQueries(
      queryClient,
      workCase.id,
      entitiesSearchSchema.parse(location.search)
    );
  },
  component: EntitiesRoute,
});
