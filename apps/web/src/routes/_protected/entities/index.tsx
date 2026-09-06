import { createFileRoute } from "@tanstack/react-router";

import { casesContextQuery } from "@/domains/cases/queries";
import { EntityTable } from "@/domains/entities/components/entity-table";
import { warmEntitiesQueries } from "@/domains/entities/lib/prefetch-entities";
import { ensureAppQueryData } from "@/shared/lib/warm-query";

function EntitiesPage() {
  return <EntityTable />;
}

export const Route = createFileRoute("/_protected/entities/")({
  loader: async ({ context: { queryClient } }) => {
    const { active } = await ensureAppQueryData(
      queryClient,
      casesContextQuery()
    );
    if (active) warmEntitiesQueries(queryClient, active.id);
  },
  component: EntitiesPage,
});
