import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import { listProposalsFn } from "@/domains/triage/triage.functions";
import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";
import type { ProposalStatus } from "@watchdog/schemas";

export const proposalsKeys = {
  all: (caseId: string) => ["proposals", caseId] as const,
  status: (caseId: string, status: ProposalStatus) =>
    ["proposals", caseId, status] as const,
};

export const proposalsByStatusQuery = (
  caseId: string,
  status: ProposalStatus
) =>
  queryOptions({
    queryKey: proposalsKeys.status(caseId, status),
    queryFn: async () => listProposalsFn({ data: { caseId, status } }),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: keepPreviousData,
  });

/** All proposals for Triage queue (pending + accepted + rejected). */
export const allProposalsQuery = (caseId: string) =>
  queryOptions({
    queryKey: proposalsKeys.all(caseId),
    queryFn: async () => listProposalsFn({ data: { caseId } }),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: keepPreviousData,
  });
