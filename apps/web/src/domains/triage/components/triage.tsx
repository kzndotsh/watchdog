import {
  useQuery,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import { TriageDetail } from "@/domains/triage/components/triage-detail";
import { TriageQueueList } from "@/domains/triage/components/triage-queue-list";
import { TriageQueueToolbar } from "@/domains/triage/components/triage-queue-toolbar";
import { useTriageWorkspace } from "@/domains/triage/hooks/use-triage-workspace";
import {
  EMPTY_TRIAGE_FILTERS,
  isTriagePendingOnlyFilters,
  PENDING_TRIAGE_FILTERS,
  type TriageQueueFilters,
} from "@/domains/triage/lib/filters";
import { allProposalsQuery } from "@/domains/triage/queries";
import { Page, PageHeader } from "@/shared/layout/page";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { bindCasesChangedInvalidation } from "@/shared/lib/query-invalidation";
import { EmptyState } from "@/shared/ui/empty-state";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import { RegionBoundary } from "@/shared/ui/region-boundary";
import { Button } from "@/shared/ui/shadcn/button";
import { SplitView } from "@/shared/ui/split-view";
import { TriageSplitPendingFallback } from "@/shared/ui/triage-split-pending-fallback";
import type { ProposalStatus } from "@watchdog/schemas";

function TriageQueueEmptyState({
  hasAnyProposals,
  pendingOnly,
  filters,
  onClearFilters,
}: {
  hasAnyProposals: boolean;
  pendingOnly: boolean;
  filters: TriageQueueFilters;
  onClearFilters: () => void;
}) {
  if (!hasAnyProposals) {
    return (
      <EmptyState
        intent="blank-slate"
        items="proposals"
        description="Capability jobs land proposals here for review."
        action={
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<Link to="/collect" />}
          >
            Open Collect
          </Button>
        }
      />
    );
  }
  if (pendingOnly) {
    return (
      <EmptyState
        intent="cleared"
        items="proposals"
        description="No pending proposals. Show all to browse accepted and rejected."
        onClearFilters={onClearFilters}
      />
    );
  }
  return (
    <EmptyState
      intent="no-results"
      items="proposals"
      query={filters.q}
      onClearFilters={onClearFilters}
    />
  );
}

function TriageActive({
  active,
  proposalId,
  filters,
  onFiltersChange,
  onProposalIdChange,
}: {
  active: CaseRecord;
  proposalId?: string;
  filters: TriageQueueFilters;
  onFiltersChange: (next: TriageQueueFilters) => void;
  onProposalIdChange: (next: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const ws = useTriageWorkspace(active.id, {
    proposalId,
    filters,
    onFiltersChange,
  });

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  return (
    <>
      {/* Sibling, not an early return — an early return here unmounts the
          split + skeleton for a frame while ?proposalId= syncs to the
          resolved selection, producing a skeleton -> blank flash. Navigate
          renders null and navigates in a layout effect, so it's safe here. */}
      {ws.selectionOutOfSync ? (
        <Navigate
          to="/triage"
          search={(prev) => ({
            ...prev,
            proposalId: ws.selectedId ?? undefined,
          })}
          replace
        />
      ) : null}
      <SplitView
        key="inbox-split"
        groupId="inbox"
        list={
          <QueueShell
            aria-label="Proposal queue"
            header={
              <QueueHeader
                label="Queue"
                count={
                  ws.rows.length === ws.allProposals.length
                    ? ws.allProposals.length
                    : `${ws.rows.length} / ${ws.allProposals.length}`
                }
              />
            }
          >
            {ws.rows.length === 0 ? (
              <TriageQueueEmptyState
                hasAnyProposals={ws.allProposals.length > 0}
                pendingOnly={isTriagePendingOnlyFilters(ws.filters)}
                filters={ws.filters}
                onClearFilters={() => {
                  ws.setFilters(EMPTY_TRIAGE_FILTERS);
                }}
              />
            ) : (
              <TriageQueueList
                proposals={ws.rows}
                selectedId={ws.selectedId}
                onSelect={(id) => {
                  onProposalIdChange(id);
                }}
              />
            )}
          </QueueShell>
        }
        detail={
          ws.allProposals.length === 0 ? (
            <div className="h-full" aria-hidden />
          ) : (
            <TriageDetail
              proposal={ws.selected}
              caseId={active.id}
              pending={ws.pending}
              error={ws.error}
              onAccept={ws.handleAccept}
              onReject={ws.handleReject}
            />
          )
        }
      />
    </>
  );
}

function TriageWithCase({
  active,
  proposalId,
  initialStatus,
  onProposalIdChange,
}: {
  active: CaseRecord;
  proposalId?: string;
  initialStatus?: ProposalStatus;
  onProposalIdChange: (next: string | null) => void;
}) {
  const [filters, setFilters] = useState<TriageQueueFilters>(() =>
    initialStatus
      ? { q: "", statuses: [initialStatus] }
      : PENDING_TRIAGE_FILTERS
  );
  const {
    data: pendingCount,
    isPending: pendingCountPending,
    isPlaceholderData: proposalsPlaceholder,
  } = useQuery({
    ...allProposalsQuery(active.id),
    select: (all) => all.filter((row) => row.status === "pending").length,
  });

  return (
    <>
      <div className={placeholderDeemphasisClass(proposalsPlaceholder)}>
        <TriageQueueToolbar
          filters={filters}
          onFiltersChange={setFilters}
          pendingCount={pendingCountPending ? undefined : pendingCount}
        />
      </div>

      <RegionBoundary fallback={<TriageSplitPendingFallback />}>
        <TriageActive
          active={active}
          proposalId={proposalId}
          filters={filters}
          onFiltersChange={setFilters}
          onProposalIdChange={onProposalIdChange}
        />
      </RegionBoundary>
    </>
  );
}

export function Triage({
  proposalId,
  initialStatus,
  onProposalIdChange,
}: {
  proposalId?: string;
  initialStatus?: ProposalStatus;
  onProposalIdChange: (next: string | null) => void;
}) {
  const [{ data: casesCtx }] = useSuspenseQueries({
    queries: [casesContextQuery()],
  });

  return (
    <Page density="split">
      <PageHeader />

      {casesCtx.active ? (
        <TriageWithCase
          active={casesCtx.active}
          proposalId={proposalId}
          initialStatus={initialStatus}
          onProposalIdChange={onProposalIdChange}
        />
      ) : (
        <EmptyState
          intent="blank-slate"
          items="cases"
          title="No Active Case"
          description={
            <>
              <Link to="/cases" className="underline">
                Select a Case
              </Link>{" "}
              to review proposals.
            </>
          }
        />
      )}
    </Page>
  );
}
