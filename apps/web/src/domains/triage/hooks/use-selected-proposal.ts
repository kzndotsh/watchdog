import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { proposalByIdQuery } from "@/domains/triage/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { TOAST_PROPOSAL_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import type { ProposalRecord } from "@watchdog/core/proposals";

type SelectedProposalArgs = {
  readonly caseId: string;
  /** The selected row's id (`?proposalId=`, or the queue's first row); null without one. */
  readonly selectedId: string | null;
  /** Drop `?proposalId=` from the URL. */
  readonly onClear: () => void;
};

export type SelectedProposal = {
  /** The selected Proposal in full, read by id; null while loading or without a selection. */
  readonly selected: ProposalRecord | null;
  /** A selection is being read: nothing to show yet and no error. */
  readonly isLoading: boolean;
  /** The by-id read failed: the copy for the error state. */
  readonly error: string | null;
  readonly retry: () => void;
};

/**
 * Triage's selection. The queue's rows carry no patch (#580), so the Detail reads the selected
 * Proposal by id (`proposals.get`) whatever page, status or view it came from; a Proposal the Case
 * no longer holds clears `?proposalId=` with a notice, and a failed read is the caller's error
 * state (Retry, Clear selection).
 */
export function useSelectedProposal({
  caseId,
  selectedId,
  onClear,
}: SelectedProposalArgs): SelectedProposal {
  const query = useQuery(proposalByIdQuery(caseId, selectedId));
  const isGone = selectedId !== null && query.isSuccess && query.data === null;

  // Writing the URL and showing a toast are the external effects of a gone selection.
  const clearGone = useEffectEvent(() => {
    toast.info(TOAST_PROPOSAL_SELECTION_GONE);
    onClear();
  });
  useEffect(() => {
    if (isGone) clearGone();
  }, [isGone]);

  return {
    selected: selectedId === null ? null : (query.data ?? null),
    isLoading: selectedId !== null && query.isPending,
    error:
      selectedId !== null && query.isError
        ? errMessage(query.error, couldnt("load", "the selected proposal"))
        : null,
    retry: () => {
      void query.refetch();
    },
  };
}
