import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";

import { Collect } from "@/domains/collect/components/collect";
import { parseCollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import { collectSearchSchema } from "@/domains/collect/lib/collect-search";
import { warmCollectQueries } from "@/domains/collect/lib/prefetch-collect";
import { usePatchSearch } from "@/shared/hooks/list/use-patch-search";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/collect");

function CollectPage() {
  const search = routeApi.useSearch();
  const onSearchChange = usePatchSearch();
  // `run` is a one-shot link from the Library: Collect opens the Run form on it, then the
  // URL forgets it so a reload or a share does not reopen the form.
  const { run } = search;
  const runTarget = useMemo(() => parseCollectRunTarget(run), [run]);
  const hasRun = run !== undefined;
  useEffect(() => {
    if (hasRun) onSearchChange({ run: undefined });
  }, [hasRun, onSearchChange]);
  return (
    <Collect
      search={search}
      onSearchChange={onSearchChange}
      runTarget={runTarget}
    />
  );
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/collect")({
  validateSearch: collectSearchSchema,
  // The view and the selection live in the URL and `useList` follows them: a filter, a search
  // or a selection never re-runs the loader.
  loaderDeps: () => ({}),
  // Thin loader, like Triage: the shell paints at once and the queue and detail show their
  // skeletons while the first page loads (a refresh included).
  loader: ({ context: { queryClient, workCase }, location }) => {
    warmCollectQueries(
      queryClient,
      workCase.id,
      collectSearchSchema.parse(location.search)
    );
  },
  component: CollectPage,
});
