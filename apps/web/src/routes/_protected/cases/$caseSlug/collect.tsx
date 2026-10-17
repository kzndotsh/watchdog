import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { Collect } from "@/domains/collect/components/collect";
import {
  ensureCollectEvidenceBlobWhenSelected,
  ensureCollectJobDetailWhenSelected,
  ensureCollectQueueQueries,
  warmCollectCatalogQueries,
} from "@/domains/collect/lib/prefetch-collect";
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
  loader: async ({ context: { queryClient, workCase }, deps: { id } }) => {
    await ensureCollectQueueQueries(queryClient, workCase.id);
    if (id) {
      await ensureCollectJobDetailWhenSelected(queryClient, workCase.id, id);
      await ensureCollectEvidenceBlobWhenSelected(queryClient, workCase.id, id);
    }
    warmCollectCatalogQueries(queryClient, workCase.id);
  },
  // Loader awaits queue lists so split panes can paint real rows on first visit.
  component: CollectPage,
});
