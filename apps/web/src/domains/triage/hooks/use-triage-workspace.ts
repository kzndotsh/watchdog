import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useCallback } from "react";
import { toast } from "sonner";

import {
  filterTriageQueue,
  PENDING_TRIAGE_FILTERS,
  proposalPatch,
  type TriageQueueFilters,
} from "@/domains/triage/lib/filters";
import { allProposalsQuery } from "@/domains/triage/queries";
import {
  acceptProposalFn,
  rejectProposalFn,
} from "@/domains/triage/triage.functions";
import {
  acceptProposalInputSchema,
  rejectProposalInputSchema,
  type AcceptFormValues,
} from "@/domains/triage/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import {
  invalidateAfterEvidenceMutation,
  invalidateAfterProposalAccept,
  invalidateAfterProposalQueueChange,
} from "@/shared/lib/query-invalidation";
import { queryLoadError } from "@/shared/lib/query-load-error";
import { isQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import { resolveQueueSelection } from "@/shared/lib/queue-selection";
import type { ProposalRecord } from "@watchdog/core";
import { patchNeedsConfidence } from "@watchdog/policy/patch-needs-confidence";
import {
  isProposalQueueLiveEvent,
  trimmedOrNull,
  type ProposalStatus,
} from "@watchdog/schemas";

const EMPTY_PROPOSALS: ProposalRecord[] = [];

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
  const proposalsQuery = useQuery(allProposalsQuery(caseId));
  const allProposals = proposalsQuery.data ?? EMPTY_PROPOSALS;
  const proposalsPlaceholder = isQueryPlaceholderData(proposalsQuery);
  const proposalsPending = listPending(proposalsQuery);
  const proposalsLoadError = queryLoadError(
    proposalsQuery,
    proposalsPending,
    "Failed to load proposals"
  );

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

  const normalizedProposalId = scopeOptionalUuid(proposalId);

  const selectedId = resolveQueueSelection(normalizedProposalId, rows, {
    holdMissingUrlId:
      normalizedProposalId !== undefined &&
      allProposals.some((row) => row.id === normalizedProposalId),
  });
  const selected = useMemo(() => {
    const fromRows = rows.find((r) => r.id === selectedId);
    if (fromRows) return fromRows;
    if (selectedId === null) return null;
    return allProposals.find((r) => r.id === selectedId) ?? null;
  }, [rows, selectedId, allProposals]);

  useLiveEvents(caseId, (event) => {
    if (isProposalQueueLiveEvent(event)) {
      setFilters((prev) => ({ ...PENDING_TRIAGE_FILTERS, q: prev.q }));
      void invalidateAfterProposalQueueChange(queryClient, caseId);
    }
    if (event.type === "entity_changed") {
      void invalidateAfterProposalQueueChange(queryClient, caseId);
    }
    if (event.type === "evidence_changed") {
      void invalidateAfterEvidenceMutation(queryClient, caseId);
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
        data: rejectProposalInputSchema.parse({
          caseId,
          proposalId: selected.id,
          reason,
        }),
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
    proposalsPlaceholder,
    proposalsPending,
    proposalsLoadError,
    handleRetryProposals: () => {
      void proposalsQuery.refetch();
    },
    rows,
    filters,
    setFilters,
    pendingCount,
    selectedId,
    selected,
    error,
    setError,
    pending: acceptMutation.isPending || rejectMutation.isPending,
    selectionOutOfSync: trimmedOrNull(proposalId) !== selectedId,
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
