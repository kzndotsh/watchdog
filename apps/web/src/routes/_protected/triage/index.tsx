import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

import { casesContextQuery } from "@/domains/cases/queries";
import { Triage } from "@/domains/triage/components/triage";
import { warmTriageQueries } from "@/domains/triage/lib/prefetch-triage";
import { PROPOSAL_STATUSES, uuidSchema } from "@watchdog/schemas";

const routeApi = getRouteApi("/_protected/triage/");

function TriagePage() {
  const { proposalId, status } = routeApi.useSearch();
  const navigate = routeApi.useNavigate();
  const onProposalIdChange = useCallback(
    (next: string | null) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          proposalId: next ?? undefined,
        }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <Triage
      proposalId={proposalId}
      initialStatus={status}
      onProposalIdChange={onProposalIdChange}
    />
  );
}

export const Route = createFileRoute("/_protected/triage/")({
  validateSearch: z.object({
    proposalId: uuidSchema.optional(),
    status: z.enum(PROPOSAL_STATUSES).optional(),
  }),
  loader: async ({ context: { queryClient } }) => {
    const { active } = await queryClient.ensureQueryData(casesContextQuery());
    if (active) warmTriageQueries(queryClient, active.id);
  },
  // Thin loader — shell paints immediately; queue body Suspense fills proposals.
  component: TriagePage,
});
