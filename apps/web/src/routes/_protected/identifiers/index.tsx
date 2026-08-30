import { createFileRoute } from "@tanstack/react-router";

import { casesContextQuery } from "@/domains/cases/queries";
import { IdentifiersPage } from "@/domains/entities/components/identifiers-page";
import { warmIdentifiersQueries } from "@/domains/entities/lib/prefetch-identifiers";

export const Route = createFileRoute("/_protected/identifiers/")({
  loader: async ({ context: { queryClient } }) => {
    const { active } = await queryClient.ensureQueryData(casesContextQuery());
    if (active) warmIdentifiersQueries(queryClient, active.id);
  },
  component: IdentifiersPage,
});
