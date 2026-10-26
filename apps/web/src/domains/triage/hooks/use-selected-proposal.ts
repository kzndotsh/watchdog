import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { proposalByIdQuery } from "@/domains/triage/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { TOAST_PROPOSAL_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import type { ProposalRecord } from "@watchdog/core/proposals";

type SelectedProposalArgs = {
  readonly caseId: string;
  /** `?proposalId=`; null without one. */
  readonly selectedId: string | null;
  /** The rows of the loaded pages. */
  readonly rows: readonly ProposalRecord[];
  /** The list's first page has landed (status is not `pending`). */
  readonly isListSettled: boolean;
  /** Drop `?proposalId=` from the URL. */
  readonly onClear: () => void;
};

export type SelectedProposal = {
  /** The selected Proposal, from a loaded page or read by id; null while unknown or without one. */
  readonly selected: ProposalRecord | null;
  /** The by-id read failed: the copy for the error state. */
  readonly error: string | null;
  readonly retry: () => void;
};

/**
 * Triage's URL selection, as the Dossier Evidence tab's (`useSelectedEvidence`). A Proposal on a
 * loaded page is used as is; only once the first page has landed without it is it read by id
 * (`proposals.get`), so a link to a row on page one costs no second request, and a Proposal the
 * view filters out (decided, on another status) still opens. One the Case no longer holds clears
 * `?proposalId=` with a notice; a failed read is the caller's error state (Retry, Clear selection).
 */
export function useSelectedProposal({
  caseId,
  selectedId,
  rows,
  isListSettled,
  onClear,
}: SelectedProposalArgs): SelectedProposal {
  const loaded =
    selectedId === null ? undefined : rows.find((row) => row.id === selectedId);
  const readId =
    selectedId !== null && loaded === undefined && isListSettled
      ? selectedId
      : null;
  const query = useQuery(proposalByIdQuery(caseId, readId));
  const isGone = readId !== null && query.isSuccess && query.data === null;

  // Writing the URL and showing a toast are the external effects of a gone selection.
  const clearGone = useEffectEvent(() => {
    toast.info(TOAST_PROPOSAL_SELECTION_GONE);
    onClear();
  });
  useEffect(() => {
    if (isGone) clearGone();
  }, [isGone]);

  return {
    selected: loaded ?? (readId === null ? null : (query.data ?? null)),
    error:
      readId !== null && query.isError
        ? errMessage(query.error, couldnt("load", "the selected proposal"))
        : null,
    retry: () => {
      void query.refetch();
    },
  };
}
