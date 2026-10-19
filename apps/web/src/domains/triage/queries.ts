import {
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
} from "@tanstack/react-query";

import {
  listProposalsFn,
  listProposalsPageFn,
} from "@/domains/triage/triage.functions";
import {
  parseListProposalsInput,
  scopeCaseId,
  scopeCaseIdEnabled,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";
import type { ProposalRecord } from "@watchdog/core/proposals";
import type { Page, ProposalStatus } from "@watchdog/schemas/shared";

export const proposalsKeys = {
  all: (caseId: string) => ["proposals", caseId] as const,
  queue: (caseId: string) => ["proposals", caseId, "queue"] as const,
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

/**
 * The Triage queue (pending, accepted and rejected), newest first, a page per fetch. `data` is
 * the loaded rows flattened: filters and the URL selection look at what is loaded, and the
 * workspace asks for further pages while they find nothing (`useFetchMoreUntil`).
 */
export const allProposalsQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = proposalsKeys.queue(scopedCaseId);
  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam }): Promise<Page<ProposalRecord>> =>
      listProposalsPageFn({
        data: parseListProposalsInput(scopedCaseId, undefined, pageParam),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    select: (data: InfiniteData<Page<ProposalRecord>, string | undefined>) =>
      data.pages.flatMap((page) => page.items),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData:
      placeholderDataForQueryKey<
        InfiniteData<Page<ProposalRecord>, string | undefined>
      >(queryKey),
  });
};
