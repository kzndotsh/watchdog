import { createFileRoute } from "@tanstack/react-router";

import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";
import { warmIdentifiersQueries } from "@/domains/entities/lib/prefetch-identifiers";

export const Route = createFileRoute("/_protected/cases/$caseSlug/identifiers")(
  {
    loader: ({ context: { queryClient, workCase } }) => {
      warmIdentifiersQueries(queryClient, workCase.id);
    },
    component: IdentifiersPage,
  }
);
