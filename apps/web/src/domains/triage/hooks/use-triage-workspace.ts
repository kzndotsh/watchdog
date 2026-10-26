import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { TRIAGE_PENDING_SEARCH } from "@/config/nav";
import { useSelectedProposal } from "@/domains/triage/hooks/use-selected-proposal";
import { proposalPatch } from "@/domains/triage/lib/filters";
import type {
  TriageSearch,
  TriageSearchPatch,
} from "@/domains/triage/lib/triage-search";
import { proposalListView } from "@/domains/triage/queries";
import {
  acceptProposalFn,
  rejectProposalFn,
} from "@/domains/triage/triage.functions";
import type { AcceptFormValues } from "@/domains/triage/types";
import { couldnt, errMessage } from "@/lib/utils";
import { useList } from "@/shared/hooks/list/use-list";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import {
  invalidateAfterProposalAccept,
  invalidateAfterProposalQueueChange,
} from "@/shared/lib/query-invalidation";
import { toast } from "@/shared/ui/toast";
import { patchNeedsConfidence } from "@watchdog/policy/patch-needs-confidence";
import {
  acceptProposalInputSchema,
  rejectProposalInputSchema,
} from "@watchdog/schemas/jobs";

export type UseTriageWorkspaceOptions = {
  /** The route's validated search: the queue's view and `proposalId`. */
  readonly search: TriageSearch;
  /** The route's `usePatchSearch` writer. */
  readonly onSearchChange: (patch: TriageSearchPatch) => void;
};

/** After Accept or Reject the queue goes back to its pending view, as the Triage link opens it. */
const AFTER_DECISION: TriageSearchPatch = {
  ...TRIAGE_PENDING_SEARCH,
  q: undefined,
};

/**
 * The Triage screen's state: the Proposal list (`useList`, a page at a time of patch-free rows,
 * its view in the URL), the selection (`?proposalId=`, the first row when absent) read in full by
 * id, and the Accept / Reject mutations.
 */
export function useTriageWorkspace(
  caseId: string,
  { search, onSearchChange }: UseTriageWorkspaceOptions
) {
  const queryClient = useQueryClient();
  const list = useList(proposalListView, {
    scope: { caseId },
    search,
    onSearchChange,
  });
  const urlId = scopeOptionalUuid(search.proposalId) ?? null;
  // Without `?proposalId=` the first row is selected, and the screen writes it to the URL.
  const selectedId = urlId ?? list.rows[0]?.id ?? null;
  const selection = useSelectedProposal({
    caseId,
    selectedId,
    onClear: () => {
      onSearchChange({ proposalId: undefined });
    },
  });
  const { selected } = selection;

  const [error, setError] = useState<string | null>(null);
  const [prevSelectedId, setPrevSelectedId] = useState(selectedId);
  if (selectedId !== prevSelectedId) {
    setPrevSelectedId(selectedId);
    setError(null);
  }

  const acceptMutation = useMutation({
    mutationFn: async (values: AcceptFormValues) => {
      if (!selected) throw new Error("Nothing selected");
      const needs = patchNeedsConfidence(proposalPatch(selected));
      return acceptProposalFn({
        data: acceptProposalInputSchema.parse({
          caseId,
          proposalId: selected.id,
          confidence: needs ? values.confidence : undefined,
          sharedEvidenceIds: values.evidenceIds,
          attestationText: values.attestationText,
        }),
      });
    },
    onSuccess: async () => {
      toast.success("Proposal accepted");
      onSearchChange(AFTER_DECISION);
      await invalidateAfterProposalAccept(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("accept", "proposal")));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!selected) throw new Error("Nothing selected");
      return rejectProposalFn({
        data: rejectProposalInputSchema.parse({
          caseId,
          proposalId: selected.id,
          reason,
        }),
      });
    },
    onSuccess: async () => {
      toast.success("Proposal rejected");
      onSearchChange(AFTER_DECISION);
      await invalidateAfterProposalQueueChange(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("reject", "proposal")));
    },
  });

  return {
    list,
    selectedId,
    selected,
    isSelectionLoading: selection.isLoading,
    selectionError: selection.error,
    retrySelection: selection.retry,
    clearSelection: () => {
      onSearchChange({ proposalId: undefined });
    },
    /** No `?proposalId=` yet while a first row stands selected: the screen writes it. */
    selectionOutOfSync: urlId === null && selectedId !== null,
    error,
    pending: acceptMutation.isPending || rejectMutation.isPending,
    handleAccept: (values: AcceptFormValues) => {
      setError(null);
      acceptMutation.mutate(values);
    },
    handleReject: (reason: string) => {
      setError(null);
      rejectMutation.mutate(reason);
    },
  };
}
