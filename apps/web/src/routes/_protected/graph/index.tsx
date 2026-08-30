import { createFileRoute } from "@tanstack/react-router";

import { GraphPage } from "@/domains/cases/components/graph-page";
import { warmGraphQueries } from "@/domains/cases/lib/prefetch-graph";
import { casesContextQuery } from "@/domains/cases/queries";

export const Route = createFileRoute("/_protected/graph/")({
  loader: async ({ context: { queryClient } }) => {
    const { active } = await queryClient.ensureQueryData(casesContextQuery());
    if (active) warmGraphQueries(queryClient, active.id);
  },
  component: GraphPage,
});
