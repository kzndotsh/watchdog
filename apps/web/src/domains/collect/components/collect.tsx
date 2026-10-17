import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useCasesContext } from "@/domains/cases/hooks/use-cases-context";
import type { CaseRecord } from "@/domains/cases/types";
import { CollectDetail } from "@/domains/collect/components/collect-detail";
import { CollectDumpButtons } from "@/domains/collect/components/collect-dump-buttons";
import { CollectQueueBody } from "@/domains/collect/components/collect-queue-body";
import { CollectQueueToolbar } from "@/domains/collect/components/collect-queue-toolbar";
import { CollectRunForm } from "@/domains/collect/components/collect-run-form";
import { CollectRunPopover } from "@/domains/collect/components/collect-run-popover";
import { useCollectWorkspace } from "@/domains/collect/hooks/use-collect-workspace";
import { collectQueueCountLabel } from "@/domains/collect/lib/collect-queue-label";
import { DumpDialogs } from "@/domains/intake/components/dump-dialogs";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { PendingRegion } from "@/shared/ui/pending-region";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import { CollectDetailSkeleton } from "@/shared/ui/skeletons";
import { SplitView } from "@/shared/ui/split-view";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@watchdog/ui/components/alert";
import { FieldError } from "@watchdog/ui/components/field";
import { Separator } from "@watchdog/ui/components/separator";

const EMPTY_CAPS: CapListItem[] = [];
const EMPTY_PLAYBOOKS: PlaybookListItem[] = [];

type CollectWithCaseProps = {
  active: CaseRecord;
  caps: CapListItem[];
  playbooks: PlaybookListItem[];
  isRunCatalogPending: boolean;
  isRunCatalogPlaceholder: boolean;
  runCatalogLoadError: string | null;
  onRetryRunCatalog: () => void;
  urlId?: string;
  onIdChange: (next: string | null) => void;
};

function CollectWithCase({
  active,
  caps,
  playbooks,
  isRunCatalogPending,
  isRunCatalogPlaceholder,
  runCatalogLoadError,
  onRetryRunCatalog,
  urlId,
  onIdChange,
}: CollectWithCaseProps) {
  const ws = useCollectWorkspace({
    caseId: active.id,
    caps,
    playbooks,
    urlId,
    onIdChange,
  });

  const handleFiltersChange = ws.setFilters;
  const handleDump = ws.setDumpModal;
  const handleRunModeChange = ws.setRunMode;
  const handleDumpOpenChange = ws.setDumpModal;
  const handleRetryQueue = ws.retryQueue;
  const runFormLoadError = runCatalogLoadError ?? ws.credentialsLoadError;
  const runFormPending = isRunCatalogPending || ws.credentialsPending;
  const handleRetryRunForm = () => {
    onRetryRunCatalog();
    ws.retryCredentials();
  };
  const handleEntityIdChange = ws.intake.setEntityId;
  const handleFiles = ws.intake.onFiles;
  const handlePaste = ws.intake.onPaste;
  const handleUrl = ws.intake.onUrl;

  let runFormBody: ReactNode;
  if (runFormPending) {
    runFormBody = <InlineLoading label="Loading caps and playbooks…" />;
  } else if (runFormLoadError) {
    runFormBody = (
      <FetchErrorAlert error={runFormLoadError} onRetry={handleRetryRunForm} />
    );
  } else {
    runFormBody = (
      <div
        className={placeholderDeemphasisClass(
          (isRunCatalogPlaceholder || ws.credentialsPending) && !runFormPending
        )}
      >
        <CollectRunForm
          key={ws.rerun?.key ?? 0}
          prefill={ws.rerun?.prefill}
          runMode={ws.runMode}
          playbooks={playbooks}
          caps={caps}
          urlDumps={ws.urlDumps}
          entities={ws.entities}
          allowThirdPartyEgress={active.allowThirdPartyEgress}
          configuredCredentials={ws.configuredCredentials}
          runError={ws.jobsWs.error}
          onRunPlaybook={async (input) => {
            await ws.jobsWs.handleRunPlaybook(input);
          }}
          onRunCap={async (input) => {
            await ws.jobsWs.handleRunCap(input);
          }}
        />
      </div>
    );
  }

  const ingressActions = (
    <div className="flex items-center gap-2">
      <CollectDumpButtons disabled={ws.intake.busy} onDump={handleDump} />
      <Separator
        orientation="vertical"
        className="data-vertical:h-4 data-vertical:self-center"
      />
      <CollectRunPopover
        runMode={ws.runMode}
        onRunModeChange={handleRunModeChange}
        isOpen={ws.isRunOpen}
        onOpenChange={ws.handleRunOpenChange}
      >
        {runFormBody}
      </CollectRunPopover>
    </div>
  );

  return (
    <>
      {/* Sibling, not an early return — an early return here unmounts the
          toolbar + split + skeleton for a frame while the URL syncs to the
          resolved selection (e.g. auto-picking the first row on a fresh
          `/collect` visit), producing a skeleton -> blank -> content flash. */}
      {ws.urlSyncOutOfDate ? (
        <Navigate
          to="/collect"
          search={(prev) => ({
            ...prev,
            id: ws.selection.rowId ?? undefined,
          })}
          replace
        />
      ) : null}
      <CollectQueueToolbar
        filters={ws.filters}
        onFiltersChange={handleFiltersChange}
        jobs={ws.jobs}
        actions={ingressActions}
      />
      <FieldError>{ws.actionError}</FieldError>
      <DumpDialogs
        open={ws.dumpModal}
        onOpenChange={handleDumpOpenChange}
        isBusy={ws.intake.busy}
        isUploading={ws.intake.uploading}
        isDumpingPaste={ws.intake.dumpingPaste}
        isDumpingUrl={ws.intake.dumpingUrl}
        uploadStatus={ws.intake.uploadStatus}
        entities={ws.entities}
        entityId={ws.intake.entityId}
        onEntityIdChange={handleEntityIdChange}
        onFiles={handleFiles}
        onPaste={handlePaste}
        onUrl={handleUrl}
      />
      {ws.jobsWs.stuckJobs.length > 0 ? (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertTitle>Worker may be down</AlertTitle>
          <AlertDescription>
            {ws.jobsWs.stuckJobs.length} job
            {ws.jobsWs.stuckJobs.length === 1 ? "" : "s"} queued or running for
            over 60s. Start the worker with{" "}
            <code className="font-mono text-xs">pnpm dev:worker</code>.
          </AlertDescription>
        </Alert>
      ) : null}
      <SplitView
        key="collect-split"
        groupId="collect"
        backLabel="Items"
        list={
          <QueueShell
            aria-label="Collect items"
            isScrollable={!ws.queuePending}
            header={
              <QueueHeader
                label={ws.filters.isHiddenOnly ? "Hidden" : "Items"}
                count={collectQueueCountLabel(
                  ws.queuePending,
                  ws.visibleRows.length,
                  ws.indexRows.length
                )}
              />
            }
          >
            <CollectQueueBody
              isQueuePending={ws.queuePending}
              queueLoadError={ws.queueLoadError}
              onRetryQueue={handleRetryQueue}
              isQueuePlaceholder={ws.queuePlaceholder}
              indexRows={ws.indexRows}
              visibleRows={ws.visibleRows}
              filters={ws.filters}
              selectionRowId={ws.selection.rowId}
              blankSlateAction={ingressActions}
              onFiltersChange={handleFiltersChange}
              onIdChange={ws.handleQueueSelect}
            />
          </QueueShell>
        }
        detail={
          <PendingRegion
            isLoading={ws.detailPending}
            label="Loading collect detail"
            fallback={<CollectDetailSkeleton />}
            className="flex h-full min-h-0 flex-col"
          >
            {ws.jobsWs.detailLoadError ? (
              <FetchErrorAlert
                error={ws.jobsWs.detailLoadError}
                onRetry={ws.jobsWs.handleRetryDetail}
              />
            ) : (
              <div
                className={cn(
                  "flex h-full min-h-0 flex-1 flex-col",
                  placeholderDeemphasisClass(
                    ws.detailPlaceholder && !ws.detailPending
                  )
                )}
              >
                <CollectDetail
                  row={ws.selected}
                  job={ws.jobsWs.detailJob}
                  caseId={active.id}
                  jobs={ws.jobs}
                  entities={ws.entities}
                  entityNameById={ws.entityNameById}
                  allowThirdPartyEgress={active.allowThirdPartyEgress}
                  evidenceActions={ws.intake.evidenceActions}
                  evidenceTitleById={ws.evidenceTitleById}
                  entityTitleById={ws.entityTitleById}
                  runSiblings={ws.jobsWs.runSiblings}
                  recipeTotal={ws.recipeTotal}
                  isBusy={ws.jobsWs.cancelBusy || ws.jobsWs.cancelPlaybookBusy}
                  onCancel={ws.jobsWs.handleCancel}
                  onCancelPlaybook={
                    ws.jobsWs.hasPlaybookRun
                      ? ws.jobsWs.handleCancelPlaybook
                      : undefined
                  }
                  isCancelPlaybookBusy={ws.jobsWs.cancelPlaybookBusy}
                  attempts={ws.jobsWs.attempts}
                  onSelectAttempt={ws.handleQueueSelect}
                  onRetry={ws.jobsWs.handleRetry}
                  isRetryBusy={ws.jobsWs.retryBusy}
                  onEditAndRerun={ws.handleEditAndRerun}
                />
              </div>
            )}
          </PendingRegion>
        }
      />
    </>
  );
}

export function Collect({
  urlId,
  onIdChange,
}: {
  urlId?: string;
  onIdChange: (next: string | null) => void;
}) {
  const {
    active,
    pending: casesPending,
    loadError: casesLoadError,
    retry: retryCases,
  } = useCasesContext();
  const capsQuery = useQuery(capabilitiesListQuery());
  const playbooksQuery = useQuery(playbooksListQuery());
  const caps = capsQuery.data ?? EMPTY_CAPS;
  const playbooks = playbooksQuery.data ?? EMPTY_PLAYBOOKS;
  const runCatalogPending =
    listPending(capsQuery) || listPending(playbooksQuery);
  const runCatalogPlaceholder =
    capsQuery.isPlaceholderData || playbooksQuery.isPlaceholderData;
  const runCatalogLoadError = combinedQueryLoadError(
    [capsQuery, playbooksQuery],
    runCatalogPending,
    "Failed to load caps and playbooks"
  );
  const handleRetryRunCatalog = () => {
    if (capsQuery.isError) void capsQuery.refetch();
    if (playbooksQuery.isError) void playbooksQuery.refetch();
  };

  let body: ReactNode;
  if (casesLoadError) {
    body = <FetchErrorAlert error={casesLoadError} onRetry={retryCases} />;
  } else if (casesPending) {
    body = (
      <PendingRegion
        isLoading
        label="Loading active case"
        fallback={<CollectDetailSkeleton />}
      >
        {null}
      </PendingRegion>
    );
  } else if (active) {
    body = (
      <CollectWithCase
        active={active}
        caps={caps}
        playbooks={playbooks}
        isRunCatalogPending={runCatalogPending}
        isRunCatalogPlaceholder={runCatalogPlaceholder}
        runCatalogLoadError={runCatalogLoadError}
        onRetryRunCatalog={handleRetryRunCatalog}
        urlId={urlId}
        onIdChange={onIdChange}
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
            to collect material.
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
