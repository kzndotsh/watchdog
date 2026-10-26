import { useQuery } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import { useMemo, type ReactNode } from "react";

import { useLiveWorkCase } from "@/domains/cases/hooks/use-live-work-case";
import type { CaseRecord } from "@/domains/cases/types";
import { CollectDetail } from "@/domains/collect/components/collect-detail";
import { CollectDumpButtons } from "@/domains/collect/components/collect-dump-buttons";
import { CollectQueueList } from "@/domains/collect/components/collect-queue-list";
import { CollectRunForm } from "@/domains/collect/components/collect-run-form";
import { CollectRunPopover } from "@/domains/collect/components/collect-run-popover";
import { useCollectWorkspace } from "@/domains/collect/hooks/use-collect-workspace";
import type { CollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import type {
  CollectSearch,
  CollectSearchPatch,
} from "@/domains/collect/lib/collect-search";
import { useEntityRefSource } from "@/domains/entities/hooks/use-entity-ref-source";
import { DumpDialogs } from "@/domains/intake/components/dump-dialogs";
import { capAttribution } from "@/domains/jobs/lib/cap-attribution";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import { useListDisplay } from "@/shared/hooks/list/use-list-display";
import { Page } from "@/shared/layout/page";
import { PageHeader } from "@/shared/layout/page-header";
import { listPending } from "@/shared/lib/list-pending";
import type { ListTagSource } from "@/shared/lib/list/list-types";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { InlineLoading } from "@/shared/ui/inline-loading";
// Not the `@/shared/ui/list` barrel: a queue never loads `ListTable` and its table chunk.
import { ListBody } from "@/shared/ui/list/list-body";
import { ListCount } from "@/shared/ui/list/list-count";
import { ListToolbar } from "@/shared/ui/list/list-toolbar";
import { PendingRegion } from "@/shared/ui/pending-region";
import { Button } from "@/shared/ui/primitives/button";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import {
  CollectDetailSkeleton,
  CollectQueueSkeleton,
  COLLECT_QUEUE_SKELETON_ROW_COUNT,
} from "@/shared/ui/skeletons";
import { SplitView } from "@/shared/ui/split-view";
import { capabilityLabel, playbookLabel } from "@/shared/ui/vocab";
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
  search: CollectSearch;
  onSearchChange: (patch: CollectSearchPatch) => void;
  runTarget?: CollectRunTarget;
};

function CollectWithCase({
  active,
  caps,
  playbooks,
  isRunCatalogPending,
  isRunCatalogPlaceholder,
  runCatalogLoadError,
  onRetryRunCatalog,
  search,
  onSearchChange,
  runTarget,
}: CollectWithCaseProps) {
  const ws = useCollectWorkspace({
    caseId: active.id,
    caps,
    playbooks,
    search,
    onSearchChange,
    runTarget,
  });
  const { list } = ws;
  const display = useListDisplay("collect");
  const entitySource = useEntityRefSource(
    active.id,
    list.query.filters.entityId
  );
  // The `capability` filter's vocabulary is the Cap and playbook catalogs.
  const capabilitySource = useMemo<ListTagSource>(
    () => ({
      kind: "tags",
      options: [
        ...caps.map((cap) => ({
          value: cap.id,
          label: capabilityLabel(cap.id),
        })),
        ...playbooks.map((playbook) => ({
          value: playbook.id,
          label: playbookLabel(playbook.id),
        })),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    }),
    [caps, playbooks]
  );
  const handleDump = ws.setDumpModal;
  const handleRunModeChange = ws.setRunMode;
  const handleDumpOpenChange = ws.setDumpModal;
  const handleRetrySelection = ws.retrySelection;
  const handleClearSelection = ws.clearSelection;
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
          initialPlaybookId={ws.initialPlaybookId}
          runMode={ws.runMode}
          playbooks={playbooks}
          caps={caps}
          urlDumps={ws.urlDumps}
          entities={ws.entities}
          caseEgress={active}
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
      {ws.selectionOutOfSync ? (
        <Navigate
          to="/cases/$caseSlug/collect"
          params={{ caseSlug: active.slug }}
          search={{ ...search, id: ws.selectedId ?? undefined }}
          replace
        />
      ) : null}
      <ListToolbar
        list={list}
        display={display}
        sources={{ entityId: entitySource, capability: capabilitySource }}
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
            isScrollable={list.status !== "pending"}
            header={
              <QueueHeader
                label={ws.isHiddenView ? "Hidden" : "Items"}
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
              skeleton={
                <CollectQueueSkeleton rows={COLLECT_QUEUE_SKELETON_ROW_COUNT} />
              }
              blankSlateAction={ingressActions}
            >
              {() => (
                <CollectQueueList
                  rows={ws.rows}
                  selectedId={ws.selected?.id ?? ws.selectedId}
                  density={display.density}
                  onSelect={ws.handleQueueSelect}
                />
              )}
            </ListBody>
          </QueueShell>
        }
        detail={
          <PendingRegion
            isLoading={ws.detailPending}
            label="Loading collect detail"
            fallback={<CollectDetailSkeleton />}
            className="flex h-full min-h-0 flex-col"
          >
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
                  jobs={ws.selected?.runs.map((run) => run.job) ?? []}
                  focusJobId={ws.focusJobId}
                  entities={ws.entities}
                  entityNameById={ws.entityNameById}
                  allowedEgress={active.allowedEgress}
                  evidenceActions={ws.intake.evidenceActions}
                  evidenceTitleById={ws.evidenceTitleById}
                  entityTitleById={ws.entityTitleById}
                  runSiblings={ws.jobsWs.runSiblings}
                  recipeTotal={ws.recipeTotal}
                  playbookRun={ws.jobsWs.playbookRun}
                  onSelectStep={ws.handleJobSelect}
                  isBusy={ws.jobsWs.cancelBusy || ws.jobsWs.cancelPlaybookBusy}
                  onCancel={ws.jobsWs.handleCancel}
                  onCancelPlaybook={
                    ws.jobsWs.hasPlaybookRun
                      ? ws.jobsWs.handleCancelPlaybook
                      : undefined
                  }
                  isCancelPlaybookBusy={ws.jobsWs.cancelPlaybookBusy}
                  attempts={ws.jobsWs.attempts}
                  onSelectAttempt={ws.handleJobSelect}
                  onRetry={ws.jobsWs.handleRetry}
                  isRetryBusy={ws.jobsWs.retryBusy}
                  onEditAndRerun={ws.handleEditAndRerun}
                  attribution={capAttribution(
                    caps,
                    ws.jobsWs.detailJob?.capabilityId
                  )}
                />
              </div>
            )}
          </PendingRegion>
        }
      />
    </>
  );
}

type CollectProps = {
  /** The route's validated search: the queue's view, `id` and the one-shot `run`. */
  search: CollectSearch;
  /** The route's `usePatchSearch` writer. */
  onSearchChange: (patch: CollectSearchPatch) => void;
  runTarget?: CollectRunTarget;
};

export function Collect({ search, onSearchChange, runTarget }: CollectProps) {
  const active = useLiveWorkCase();
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

  return (
    <Page density="split">
      <PageHeader />

      <CollectWithCase
        active={active}
        caps={caps}
        playbooks={playbooks}
        isRunCatalogPending={runCatalogPending}
        isRunCatalogPlaceholder={runCatalogPlaceholder}
        runCatalogLoadError={runCatalogLoadError}
        onRetryRunCatalog={handleRetryRunCatalog}
        search={search}
        onSearchChange={onSearchChange}
        runTarget={runTarget}
      />
    </Page>
  );
}
