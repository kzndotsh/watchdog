import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState, type ReactNode } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { TriageDetail } from "@/domains/triage/components/triage-detail";
import { TriageQueueList } from "@/domains/triage/components/triage-queue-list";
import { TriageQueueToolbar } from "@/domains/triage/components/triage-queue-toolbar";
import { useTriageWorkspace } from "@/domains/triage/hooks/use-triage-workspace";
import {
  EMPTY_TRIAGE_FILTERS,
  isTriagePendingOnlyFilters,
  triageStatusesFromSearch,
  triageStatusSearchParam,
  type TriageQueueFilters,
} from "@/domains/triage/lib/filters";
import { Page, PageHeader } from "@/shared/layout/page";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { bindCasesChangedInvalidation } from "@/shared/lib/query-invalidation";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
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
  ws,
  onProposalIdChange,
}: {
  active: CaseRecord;
  ws: ReturnType<typeof useTriageWorkspace>;
  onProposalIdChange: (next: string | null) => void;
}) {
  const queryClient = useQueryClient();

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
            <div
              className={placeholderDeemphasisClass(ws.proposalsPlaceholder)}
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
            </div>
          </QueueShell>
        }
        detail={
          ws.allProposals.length === 0 ? (
            <div className="h-full" aria-hidden />
          ) : (
            <TriageDetail
              key={ws.selected?.id ?? "empty"}
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
  onStatusSearchChange,
}: {
  active: CaseRecord;
  proposalId?: string;
  initialStatus?: ProposalStatus;
  onProposalIdChange: (next: string | null) => void;
  onStatusSearchChange?: (status: ProposalStatus | undefined) => void;
}) {
  const [filters, setFilters] = useState<TriageQueueFilters>(() => ({
    q: "",
    statuses: triageStatusesFromSearch(initialStatus),
  }));

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      statuses: triageStatusesFromSearch(initialStatus),
    }));
  }, [initialStatus]);

  const handleFiltersChange = useCallback(
    (next: TriageQueueFilters) => {
      setFilters(next);
      onStatusSearchChange?.(triageStatusSearchParam(next));
    },
    [onStatusSearchChange]
  );
  const ws = useTriageWorkspace(active.id, {
    proposalId,
    filters,
    onFiltersChange: handleFiltersChange,
  });

  let body: ReactNode;
  if (ws.proposalsLoadError) {
    body = (
      <FetchErrorAlert
        error={ws.proposalsLoadError}
        onRetry={ws.handleRetryProposals}
      />
    );
  } else if (ws.proposalsPending) {
    body = <TriageSplitPendingFallback />;
  } else {
    body = (
      <TriageActive
        active={active}
        ws={ws}
        onProposalIdChange={onProposalIdChange}
      />
    );
  }

  return (
    <>
      <div className={placeholderDeemphasisClass(ws.proposalsPlaceholder)}>
        <TriageQueueToolbar
          filters={filters}
          onFiltersChange={handleFiltersChange}
          pendingCount={ws.proposalsPending ? undefined : ws.pendingCount}
        />
      </div>

      {body}
    </>
  );
}

export function Triage({
  proposalId,
  initialStatus,
  onProposalIdChange,
  onStatusSearchChange,
}: {
  proposalId?: string;
  initialStatus?: ProposalStatus;
  onProposalIdChange: (next: string | null) => void;
  onStatusSearchChange?: (status: ProposalStatus | undefined) => void;
}) {
  const {
    active,
    pending: casesPending,
    loadError: casesLoadError,
    retry: retryCases,
  } = useCasesContext();

  let body: ReactNode;
  if (casesLoadError) {
    body = <FetchErrorAlert error={casesLoadError} onRetry={retryCases} />;
  } else if (casesPending) {
    body = <TriageSplitPendingFallback />;
  } else if (active) {
    body = (
      <TriageWithCase
        active={active}
        proposalId={proposalId}
        initialStatus={initialStatus}
        onProposalIdChange={onProposalIdChange}
        onStatusSearchChange={onStatusSearchChange}
      />
    );
  } else {
    body = (
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
    );
  }

  return (
    <Page density="split">
      <PageHeader />

      {body}
    </Page>
  );
}
