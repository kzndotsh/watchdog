import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { casesContextQuery } from "@/domains/cases/queries";
import { Collect } from "@/domains/collect/components/collect";
import {
  ensureCollectEvidenceBlobWhenSelected,
  ensureCollectJobDetailWhenSelected,
  ensureCollectQueueQueries,
  warmCollectCatalogQueries,
} from "@/domains/collect/lib/prefetch-collect";
import { uuidSchema } from "@watchdog/schemas";

const routeApi = getRouteApi("/_protected/collect/");

function CollectPage() {
  const { id } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const onIdChange = useCallback(
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
  return <Collect urlId={id} onIdChange={onIdChange} />;
}

export const Route = createFileRoute("/_protected/collect/")({
  validateSearch: z.object({ id: uuidSchema.optional() }),
  loaderDeps: ({ search: { id } }) => ({ id }),
  loader: async ({ context: { queryClient }, deps: { id } }) => {
    const { active } = await queryClient.ensureQueryData(casesContextQuery());
    if (active) {
      await ensureCollectQueueQueries(queryClient, active.id);
      if (id) {
        await ensureCollectJobDetailWhenSelected(queryClient, active.id, id);
        await ensureCollectEvidenceBlobWhenSelected(queryClient, active.id, id);
      }
      warmCollectCatalogQueries(queryClient, active.id);
    }
  },
  // Loader awaits queue lists so split panes can paint real rows on first visit.
  component: CollectPage,
});
