import { queryOptions } from "@tanstack/react-query";

import { orpc } from "@/lib/orpc-client";
import { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";
import { listView } from "@/shared/lib/list/list-view";
import {
  parseCaseScopeInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeOptionalUuid,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_REALTIME, STALE_REALTIME } from "@/shared/lib/query-stale";
import type { ProposalQueueItem } from "@watchdog/core/proposals";
import { proposalList } from "@watchdog/schemas/jobs";
import type { ListPage } from "@watchdog/schemas/shared";

/** Rows the Dashboard and the Case overview show: their longest pending list (12 activity rows). */
const PENDING_SUMMARY_LIMIT = 12;

function pendingSummaryInput(caseId: string) {
  return {
    caseId,
    status: ["pending" as const],
    limit: PENDING_SUMMARY_LIMIT,
  };
}

/**
 * Proposals keys are the oRPC procedure keys: `all(caseId)` is `[["proposals"], { input: { caseId } }]`,
 * every Proposals query of the Case whatever its procedure, filters or cursor.
 */
export const proposalsKeys = {
  all: (caseId: string) => orpc.proposals.key({ input: { caseId } }),
  byId: (caseId: string, proposalId: string) =>
    orpc.proposals.get.queryKey({ input: { caseId, proposalId } }),
  pendingSummary: (caseId: string) =>
    orpc.proposals.queuePage.queryKey({ input: pendingSummaryInput(caseId) }),
};

export type ProposalListScope = { readonly caseId: string };

/**
 * The Case's Proposal list (ADR-0007): the Triage queue, a page at a time, as queue rows (no
 * patch, #580; the Detail reads the full Proposal by id). Keys sit under
 * `proposalsKeys.all(caseId)`, so SSE and Accept/Reject refresh every view.
 */
export const proposalListView = listView(proposalList, {
  procedure: orpc.proposals.queuePage,
  scopeInput: ({ caseId }: ProposalListScope) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  getId: (row: ProposalQueueItem) => row.id,
  staleTime: STALE_REALTIME,
  gcTime: GC_REALTIME,
});

/**
 * One Proposal by id, for a URL-selected row the queue has not loaded; null when the Case has
 * no such Proposal (decided and gone from no view, a stale link). Never runs without an id.
 */
export const proposalByIdQuery = (
  caseId: string,
  proposalId: string | null
) => {
  const scopedCaseId = scopeCaseId(caseId);
  const scopedId = scopeOptionalUuid(proposalId) ?? "";
  return queryOptions({
    queryKey: proposalsKeys.byId(scopedCaseId, scopedId),
    queryFn: async () =>
      orpcNullIfNotFound(
        orpc.proposals.get.call({
          ...parseCaseScopeInput(scopedCaseId),
          proposalId: scopedId,
        })
      ),
    enabled: scopedId !== "" && scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
  });
};

/** The pending Proposals the Dashboard and the Case overview show, and how many there are. */
export type PendingProposalsSummary = {
  readonly items: ProposalQueueItem[];
  /** The pending count, capped at `LIST_TOTAL_CAP`. */
  readonly count: number;
  /** `count` for a metric tile: "1000+" at the cap. */
  readonly countLabel: number | string;
};

function pendingSummaryOf(
  page: ListPage<ProposalQueueItem>
): PendingProposalsSummary {
  const total = page.total ?? { count: page.items.length, isCapped: false };
  return {
    items: page.items,
    count: total.count,
    countLabel: total.isCapped ? `${String(total.count)}+` : total.count,
  };
}

/**
 * The newest pending Proposals and their count (`total`), for the Dashboard and the Case
 * overview: one small first page of `status=pending`, never every page.
 */
export const pendingProposalsQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = proposalsKeys.pendingSummary(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<ListPage<ProposalQueueItem>> =>
      orpc.proposals.queuePage.call(pendingSummaryInput(scopedCaseId)),
    select: pendingSummaryOf,
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
