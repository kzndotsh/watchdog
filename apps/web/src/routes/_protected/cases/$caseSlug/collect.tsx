import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { Collect } from "@/domains/collect/components/collect";
import { warmCollectQueries } from "@/domains/collect/lib/prefetch-collect";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

const routeApi = getRouteApi("/_protected/cases/$caseSlug/collect");

function CollectPage() {
  const { id } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const handleIdChange = useCallback(
    (next: string | null) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          id: next ?? undefined,
        }),
        replace: true,
      });
    },
    [navigate]
  );
  return <Collect urlId={id} onIdChange={handleIdChange} />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/collect")({
  validateSearch: z.object({ id: optionalUuidSchema }),
  loaderDeps: ({ search: { id } }) => ({ id }),
  loader: ({ context: { queryClient, workCase }, deps: { id } }) => {
    warmCollectQueries(queryClient, workCase.id, { selectedId: id });
  },
  // Thin loader, like Triage: the shell paints at once and the queue and detail show their
  // skeletons while the lists load (a refresh included).
  component: CollectPage,
});
