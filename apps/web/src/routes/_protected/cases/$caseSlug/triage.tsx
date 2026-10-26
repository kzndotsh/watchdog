import { createFileRoute } from "@tanstack/react-router";

import { Triage } from "@/domains/triage/components/triage";
import { warmTriageQueries } from "@/domains/triage/lib/prefetch-triage";
import { triageSearchSchema } from "@/domains/triage/lib/triage-search";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";

function TriageRoute() {
  const search = Route.useSearch();
  const onSearchChange = usePatchSearch();
  return <Triage search={search} onSearchChange={onSearchChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/triage")({
  validateSearch: triageSearchSchema,
  // The view and the selection live in the URL and `useList` follows them: a filter, a search
  // or a selection never re-runs the loader.
  loaderDeps: () => ({}),
  loader: ({ context: { queryClient, workCase }, location }) => {
    warmTriageQueries(
      queryClient,
      workCase.id,
      triageSearchSchema.parse(location.search)
    );
  },
  component: TriageRoute,
});
