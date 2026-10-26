import { Link, Navigate } from "@tanstack/react-router";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import { TriageDetail } from "@/domains/triage/components/triage-detail";
import { TriageQueueList } from "@/domains/triage/components/triage-queue-list";
import { useTriageWorkspace } from "@/domains/triage/hooks/use-triage-workspace";
import type {
  TriageSearch,
  TriageSearchPatch,
} from "@/domains/triage/lib/triage-search";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
// Not the `@/shared/ui/list` barrel: a queue never loads `ListTable` and its table chunk.
import { ListBody } from "@/shared/ui/list/list-body";
import { ListCount } from "@/shared/ui/list/list-count";
import { ListToolbar } from "@/shared/ui/list/list-toolbar";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/primitives/button";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import { QueueSkeleton } from "@/shared/ui/skeletons";
import { SplitView } from "@/shared/ui/split-view";
import { TriageDetailSkeleton } from "@/shared/ui/triage-detail-skeleton";

type TriageProps = {
  /** The route's validated search: the queue's view and `proposalId`. */
  readonly search: TriageSearch;
  /** The route's `usePatchSearch` writer. */
  readonly onSearchChange: (patch: TriageSearchPatch) => void;
};

/**
 * Triage: the Proposal list (ADR-0007) as the Queue, a page at a time with its view in the URL,
 * and the selected Proposal's Detail (decide header, patch ledger, Accept / Reject footer).
 */
export function Triage({ search, onSearchChange }: TriageProps) {
  const active = useLiveWorkCase();
  const ws = useTriageWorkspace(active.id, { search, onSearchChange });
  const { list } = ws;
  const display = useListDisplay("triage");
  const isDetailShown = list.status === "ready" || ws.selected !== null;
  const handleRetrySelection = ws.retrySelection;
  const handleClearSelection = ws.clearSelection;

  return (
    <Page density="split">
      <PageHeader />
      <ListToolbar list={list} display={display} />
      {/* Sibling, not an early return: Navigate renders null and writes the first row's id
          to the URL in a layout effect, so the split never unmounts for a frame. */}
      {ws.selectionOutOfSync ? (
        <Navigate
          to="/cases/$caseSlug/triage"
          params={{ caseSlug: active.slug }}
          search={{ ...search, proposalId: ws.selectedId ?? undefined }}
          replace
        />
      ) : null}
      <SplitView
        key="inbox-split"
        groupId="inbox"
        backLabel="Queue"
        list={
          <QueueShell
            aria-label="Proposal queue"
            header={
              <QueueHeader
                label="Queue"
                count={
                  <ListCount
                    count={list.count}
                    noun={list.def.noun}
                    variant="compact"
                    isLive={false}
                  />
                }
              />
            }
          >
            <ListBody
              list={list}
              skeleton={<QueueSkeleton />}
              blankSlateAction={
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      to="/cases/$caseSlug/collect"
                      params={{ caseSlug: active.slug }}
                    />
                  }
                >
                  Open Collect
                </Button>
              }
            >
              {(rows) => (
                <TriageQueueList
                  proposals={rows}
                  selectedId={ws.selectedId}
                  density={display.density}
                  onSelect={(id) => {
                    onSearchChange({ proposalId: id });
                  }}
                />
              )}
            </ListBody>
          </QueueShell>
        }
        detail={
          <div className="flex h-full min-h-0 flex-col">
            {ws.selectionError === null ? null : (
              <div className="flex flex-col gap-2 p-3">
                <FetchErrorAlert
                  error={ws.selectionError}
                  onRetry={handleRetrySelection}
                />
                <div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={handleClearSelection}
                  >
                    Clear selection
                  </Button>
                </div>
              </div>
            )}
            {list.status === "pending" && ws.selected === null ? (
              <PendingRegion
                isLoading
                label="Loading triage detail"
                fallback={<TriageDetailSkeleton className="min-h-0 flex-1" />}
                className="flex h-full min-h-0 flex-col"
              >
                {null}
              </PendingRegion>
            ) : null}
            {isDetailShown ? (
              <TriageDetail
                key={ws.selected?.id ?? "empty"}
                proposal={ws.selected}
                caseId={active.id}
                isPending={ws.pending}
                error={ws.error}
                onAccept={ws.handleAccept}
                onReject={ws.handleReject}
              />
            ) : (
              <div className="flex-1" aria-hidden />
            )}
          </div>
        }
      />
    </Page>
  );
}
