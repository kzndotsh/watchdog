import { queryOptions } from "@tanstack/react-query";

import { listProposalsFn } from "@/domains/triage/triage.functions";
import {
  parseListProposalsInput,
  scopeCaseId,
  scopeCaseIdEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
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
) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = proposalsKeys.status(scopedCaseId, status);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listProposalsFn({
        data: parseListProposalsInput(scopedCaseId, status),
      }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** All proposals for Triage queue (pending + accepted + rejected). */
export const allProposalsQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = proposalsKeys.all(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listProposalsFn({ data: parseListProposalsInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
