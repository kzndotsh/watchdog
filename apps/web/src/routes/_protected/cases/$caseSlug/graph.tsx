import { createFileRoute } from "@tanstack/react-router";

import { GraphPage } from "@/domains/entities/components/graph-page";
import { warmGraphQueries } from "@/domains/entities/lib/prefetch-graph";

export const Route = createFileRoute("/_protected/cases/$caseSlug/graph")({
  loader: ({ context: { queryClient, workCase } }) => {
    warmGraphQueries(queryClient, workCase.id);
  },
  component: GraphPage,
});
