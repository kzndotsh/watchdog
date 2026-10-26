import { Link } from "@tanstack/react-router";

import { TRIAGE_PENDING_SEARCH } from "@/config/nav";
import { useWorkCase } from "@/shared/hooks/use-route-case";
import { Button } from "@/shared/ui/primitives/button";

/** Opens the Proposal a Job produced, in Triage of the Job's own Case (the Case in the URL). */
export function JobProposalLink({ proposalId }: { proposalId: string }) {
  const { slug: caseSlug } = useWorkCase();
  return (
    <Button
      nativeButton={false}
      render={
        <Link
          to="/cases/$caseSlug/triage"
          params={{ caseSlug }}
          search={{ ...TRIAGE_PENDING_SEARCH, proposalId }}
        />
      }
    >
      Open Proposal in Triage
    </Button>
  );
}
