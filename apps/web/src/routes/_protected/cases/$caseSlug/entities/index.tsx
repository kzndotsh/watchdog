import { createFileRoute } from "@tanstack/react-router";

import { EntityTable } from "@/domains/entities/components/entity-table";
import { warmEntitiesQueries } from "@/domains/entities/lib/prefetch-entities";

function EntitiesPage() {
  return <EntityTable />;
}

export const Route = createFileRoute("/_protected/cases/$caseSlug/entities/")({
  loader: ({ context: { queryClient, workCase } }) => {
    warmEntitiesQueries(queryClient, workCase.id);
  },
  component: EntitiesPage,
});
