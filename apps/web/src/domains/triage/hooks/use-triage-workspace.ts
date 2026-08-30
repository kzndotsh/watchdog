import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";

import {
  filterTriageQueue,
  PENDING_TRIAGE_FILTERS,
  type TriageQueueFilters,
} from "@/domains/triage/lib/filters";
import { allProposalsQuery } from "@/domains/triage/queries";
import {
  acceptProposalFn,
  rejectProposalFn,
} from "@/domains/triage/triage.functions";
import type { AcceptFormValues } from "@/domains/triage/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import {
  invalidateAfterProposalAccept,
  invalidateAfterProposalQueueChange,
} from "@/shared/lib/query-invalidation";
import { resolveQueueSelection } from "@/shared/lib/queue-selection";
import { patchNeedsConfidence } from "@watchdog/policy";
import type { ProposalStatus } from "@watchdog/schemas";

export interface UseTriageWorkspaceOptions {
  proposalId?: string;
  initialStatus?: ProposalStatus;
  filters?: TriageQueueFilters;
  onFiltersChange?: (next: TriageQueueFilters) => void;
}

function resolveTriageFilters(
  next: TriageQueueFilters | ((prev: TriageQueueFilters) => TriageQueueFilters),
  prev: TriageQueueFilters
): TriageQueueFilters {
  if (typeof next === "function") {
    return next(prev);
  }
  return next;
}

export function useTriageWorkspace(
  caseId: string,
  {
    proposalId,
    initialStatus,
    filters: controlledFilters,
    onFiltersChange,
  }: UseTriageWorkspaceOptions
) {
  const queryClient = useQueryClient();
  const { data: allProposals } = useSuspenseQuery(allProposalsQuery(caseId));

  const [internalFilters, setInternalFilters] = useState<TriageQueueFilters>(
    () =>
      initialStatus
        ? { q: "", statuses: [initialStatus] }
        : PENDING_TRIAGE_FILTERS
  );
  const filters = controlledFilters ?? internalFilters;
  const setFilters = useCallback(
    (
      next:
        | TriageQueueFilters
        | ((prev: TriageQueueFilters) => TriageQueueFilters)
    ) => {
      const resolved = resolveTriageFilters(next, filters);
      if (onFiltersChange) {
        onFiltersChange(resolved);
      } else {
        setInternalFilters(resolved);
      }
    },
    [filters, onFiltersChange]
  );
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(
    () => filterTriageQueue(allProposals, filters),
    [allProposals, filters]
  );
  const pendingCount = useMemo(
    () => allProposals.filter((r) => r.status === "pending").length,
    [allProposals]
  );

  const selectedId = resolveQueueSelection(proposalId, rows);
  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId]
  );

  useLiveEvents(caseId, (event) => {
    if (event.type === "proposal_created") {
      setFilters((prev) => ({ ...PENDING_TRIAGE_FILTERS, q: prev.q }));
      void invalidateAfterProposalQueueChange(queryClient, caseId);
    }
  });

  const [prevSelectedProposalId, setPrevSelectedProposalId] = useState(
    selected?.id ?? null
  );
  if ((selected?.id ?? null) !== prevSelectedProposalId) {
    setPrevSelectedProposalId(selected?.id ?? null);
    setError(null);
  }

  const acceptMutation = useMutation({
    mutationFn: async (values: AcceptFormValues) => {
      if (!selected) throw new Error("Nothing selected");
      const needs = patchNeedsConfidence(selected.patch);
      return acceptProposalFn({
        data: {
          caseId,
          proposalId: selected.id,
          confidence: needs ? values.confidence : undefined,
          sharedEvidenceIds: values.evidenceIds,
          attestationText: values.attestationText.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Proposal accepted");
      setFilters(PENDING_TRIAGE_FILTERS);
      await invalidateAfterProposalAccept(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Accept failed"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!selected) throw new Error("Nothing selected");
      return rejectProposalFn({
        data: {
          caseId,
          proposalId: selected.id,
          reason: reason.trim() || undefined,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Proposal rejected");
      setFilters(PENDING_TRIAGE_FILTERS);
      await invalidateAfterProposalQueueChange(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Reject failed"));
    },
  });

  return {
    allProposals,
    rows,
    filters,
    setFilters,
    pendingCount,
    selectedId,
    selected,
    error,
    setError,
    pending: acceptMutation.isPending || rejectMutation.isPending,
    selectionOutOfSync: (proposalId ?? null) !== selectedId,
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
