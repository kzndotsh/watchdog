import {
  useQuery,
  useQueryClient,
  useSuspenseQueries,
} from "@tanstack/react-query";
import { Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";

import { casesContextQuery } from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";
import {
  CollectDumpButtons,
  CollectRunPopover,
  type CollectRunMode,
} from "@/domains/collect/components/collect-action-controls";
import { CollectDetail } from "@/domains/collect/components/collect-detail";
import { CollectQueueList } from "@/domains/collect/components/collect-queue-list";
import { CollectQueueToolbar } from "@/domains/collect/components/collect-queue-toolbar";
import { collectDetailPending } from "@/domains/collect/lib/collect-detail-pending";
import {
  filterCollectRows,
  resolveCollectSelection,
} from "@/domains/collect/lib/collect-filters";
import { buildCollectIndex } from "@/domains/collect/lib/collect-index";
import { resolveCollectJobDetailId } from "@/domains/collect/lib/collect-job-detail";
import { prefetchCollectEvidenceBlobWhenSelected } from "@/domains/collect/lib/prefetch-collect";
import {
  EMPTY_COLLECT_FILTERS,
  type CollectFilters,
  type CollectRow,
} from "@/domains/collect/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import {
  DumpDialogs,
  type DumpModal,
} from "@/domains/intake/components/dump-dialogs";
import { useIntakeActions } from "@/domains/intake/hooks/use-intake-actions";
import { evidenceListQuery } from "@/domains/intake/queries";
import {
  JobCapRunForm,
  type CapRunVars,
} from "@/domains/jobs/components/job-cap-run-form";
import {
  JobPlaybookRunForm,
  type PlaybookRunVars,
} from "@/domains/jobs/components/job-playbook-run-form";
import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";
import { sortJobQueue } from "@/domains/jobs/lib/status";
import {
  capabilitiesListQuery,
  jobDetailQuery,
  jobsListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { credentialsListQuery } from "@/domains/settings/queries";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { Page, PageHeader } from "@/shared/layout/page";
import { listPending } from "@/shared/lib/list-pending";
import { placeholderDeemphasisClass } from "@/shared/lib/placeholder-deemphasis";
import {
  bindCasesChangedInvalidation,
  invalidateAfterEvidenceMutation,
} from "@/shared/lib/query-invalidation";
import { EmptyState } from "@/shared/ui/empty-state";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { InlineLoading } from "@/shared/ui/inline-loading";
import { PendingRegion } from "@/shared/ui/pending-region";
import { QueueHeader } from "@/shared/ui/queue-header";
import { QueueShell } from "@/shared/ui/queue-shell";
import { Alert, AlertDescription, AlertTitle } from "@/shared/ui/shadcn/alert";
import { Separator } from "@/shared/ui/shadcn/separator";
import {
  CollectDetailSkeleton,
  CollectQueueSkeleton,
  COLLECT_QUEUE_SKELETON_ROW_COUNT,
} from "@/shared/ui/skeletons";
import { SplitView } from "@/shared/ui/split-view";

function collectQueueCountLabel(
  queuePending: boolean,
  visibleCount: number,
  totalCount: number
): string | undefined {
  if (queuePending) return undefined;
  if (visibleCount === totalCount) return String(totalCount);
  return `${visibleCount} / ${totalCount}`;
}

function CollectRunFormPanel({
  runMode,
  playbooks,
  caps,
  urlDumps,
  entities,
  allowThirdPartyEgress,
  configuredCredentials,
  runError,
  onRunPlaybook,
  onRunCap,
}: {
  runMode: CollectRunMode;
  playbooks: PlaybookListItem[];
  caps: CapListItem[];
  urlDumps: { id: string; sourceUrl: string; label: string | null }[];
  entities: { id: string; name: string }[];
  allowThirdPartyEgress: boolean;
  configuredCredentials: Set<string>;
  runError: string | null;
  onRunPlaybook: (vars: PlaybookRunVars) => Promise<void>;
  onRunCap: (vars: CapRunVars) => Promise<void>;
}) {
  if (runMode === "playbook") {
    return (
      <JobPlaybookRunForm
        playbooks={playbooks}
        urlDumps={urlDumps}
        entities={entities}
        allowThirdPartyEgress={allowThirdPartyEgress}
        configuredCredentials={configuredCredentials}
        runError={runError}
        onRunPlaybook={onRunPlaybook}
        layout="stacked"
      />
    );
  }
  return (
    <JobCapRunForm
      caps={caps}
      entities={entities}
      allowThirdPartyEgress={allowThirdPartyEgress}
      configuredCredentials={configuredCredentials}
      runError={runError}
      onRunCap={onRunCap}
      layout="stacked"
    />
  );
}

function renderCollectQueueBody({
  queuePending,
  queueLoadError,
  onRetryQueue,
  queuePlaceholder,
  indexRows,
  visibleRows,
  filters,
  selectionRowId,
  intakeBusy,
  setDumpModal,
  setFilters,
  onIdChange,
}: {
  queuePending: boolean;
  queueLoadError: string | null;
  onRetryQueue: () => void;
  queuePlaceholder: boolean;
  indexRows: readonly CollectRow[];
  visibleRows: readonly CollectRow[];
  filters: CollectFilters;
  selectionRowId: string | null;
  intakeBusy: boolean;
  setDumpModal: (next: DumpModal | null) => void;
  setFilters: (next: CollectFilters) => void;
  onIdChange: (next: string | null) => void;
}) {
  if (queueLoadError !== null) {
    return <FetchErrorAlert error={queueLoadError} onRetry={onRetryQueue} />;
  }
  if (!queuePending && indexRows.length === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="items"
        description="Dump File, Paste, or URL evidence first. Then Run a Cap (one capability) or Playbook (curated Cap chain) when you need acquisition."
        action={
          <CollectDumpButtons disabled={intakeBusy} onDump={setDumpModal} />
        }
      />
    );
  }
  if (!queuePending && visibleRows.length === 0) {
    return (
      <EmptyState
        intent="no-results"
        items="items"
        query={filters.q}
        onClearFilters={() => {
          setFilters(EMPTY_COLLECT_FILTERS);
        }}
      />
    );
  }
  return (
    <PendingRegion
      loading={queuePending}
      label="Loading collect queue"
      fallback={
        <CollectQueueSkeleton rows={COLLECT_QUEUE_SKELETON_ROW_COUNT} />
      }
    >
      <div className={placeholderDeemphasisClass(queuePlaceholder)}>
        <CollectQueueList
          rows={visibleRows}
          selectedId={selectionRowId}
          onSelect={onIdChange}
        />
      </div>
    </PendingRegion>
  );
}

function CollectWithCase({
  active,
  caps,
  playbooks,
  runCatalogPending,
  urlId,
  onIdChange,
}: {
  active: CaseRecord;
  caps: CapListItem[];
  playbooks: PlaybookListItem[];
  runCatalogPending: boolean;
  urlId?: string;
  onIdChange: (next: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const evidenceQuery = useQuery(
    evidenceListQuery(active.id, { hiddenOnly: false })
  );
  const hiddenEvidenceQuery = useQuery(
    evidenceListQuery(active.id, { hiddenOnly: true })
  );
  const jobsQuery = useQuery(jobsListQuery(active.id));
  const entitiesQuery = useQuery(entitiesListQuery(active.id));
  const {
    data: evidenceRows = [],
    isPlaceholderData: evidencePlaceholder,
    isError: evidenceError,
    error: evidenceLoadError,
  } = evidenceQuery;
  const {
    data: hiddenEvidenceRows = [],
    isPlaceholderData: hiddenEvidencePlaceholder,
    isError: hiddenEvidenceError,
    error: hiddenEvidenceLoadError,
  } = hiddenEvidenceQuery;
  const {
    data: jobsRaw = [],
    isFetching: jobsListFetching,
    isError: jobsError,
    error: jobsLoadError,
  } = jobsQuery;
  const { data: credentialSlots = [] } = useQuery(credentialsListQuery());

  const [filters, setFilters] = useState<CollectFilters>(EMPTY_COLLECT_FILTERS);

  const queueCorePending =
    listPending(evidenceQuery) ||
    listPending(jobsQuery) ||
    listPending(entitiesQuery);
  const queuePending =
    queueCorePending ||
    (filters.hiddenOnly && listPending(hiddenEvidenceQuery));
  const queuePlaceholder = filters.hiddenOnly
    ? hiddenEvidencePlaceholder
    : evidencePlaceholder;
  const queueLoadError =
    evidenceError || hiddenEvidenceError || jobsError
      ? errMessage(
          evidenceLoadError ?? hiddenEvidenceLoadError ?? jobsLoadError ?? null,
          "Failed to load collect queue"
        )
      : null;

  const { data: entities = [] } = entitiesQuery;

  const [dumpModal, setDumpModal] = useState<DumpModal | null>(null);
  const [runMode, setRunMode] = useState<CollectRunMode>("cap");

  const evidence = useMemo(
    () => (filters.hiddenOnly ? hiddenEvidenceRows : evidenceRows),
    [evidenceRows, hiddenEvidenceRows, filters.hiddenOnly]
  );
  const jobs = useMemo(() => sortJobQueue(jobsRaw), [jobsRaw]);
  const recipeStepCountByPlaybookId = useMemo(() => {
    const map = new Map<string, number>();
    for (const playbook of playbooks) {
      map.set(playbook.id, playbook.steps.length);
    }
    return map;
  }, [playbooks]);
  const configuredCredentials = useMemo(() => {
    const names = new Set<string>();
    for (const slot of credentialSlots) {
      if (slot.configured) names.add(slot.name);
    }
    return names;
  }, [credentialSlots]);
  const urlDumps = useMemo(
    () =>
      evidenceRows.flatMap((row) => {
        const sourceUrl = row.sourceUrl?.trim();
        if (sourceUrl === undefined || sourceUrl === "") return [];
        return [{ id: row.id, sourceUrl, label: row.label }];
      }),
    [evidenceRows]
  );

  const index = useMemo(
    () =>
      buildCollectIndex(evidence, jobs, {
        recipeStepsByPlaybookId: recipeStepCountByPlaybookId,
      }),
    [evidence, jobs, recipeStepCountByPlaybookId]
  );
  const visibleRows = useMemo(
    () => filterCollectRows(index.rows, filters),
    [index.rows, filters]
  );
  const selection = useMemo(
    () =>
      resolveCollectSelection(
        urlId,
        (id: string) => index.rowById(id),
        visibleRows,
        {
          holdMissingId:
            jobsListFetching ||
            (urlId !== undefined &&
              jobs.some(
                (job) => job.id === urlId || job.playbookRunId === urlId
              )),
        }
      ),
    [urlId, index, visibleRows, jobsListFetching, jobs]
  );
  const selected = useMemo(
    () => (selection.rowId === null ? null : index.rowById(selection.rowId)),
    [index, selection.rowId]
  );

  const entityNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const ent of entities) map.set(ent.id, ent.name);
    return map;
  }, [entities]);

  const intake = useIntakeActions({
    caseId: active.id,
    selectedEvidenceId: selected?.evidence?.id ?? null,
    onEvidenceIdChange: onIdChange,
    closeDumpModal: () => {
      setDumpModal(null);
    },
    onRestoreShowActiveQueue: () => {
      setFilters((prev) => ({ ...prev, hiddenOnly: false }));
    },
  });

  const handleQueueSelect = useCallback(
    (next: string | null) => {
      if (next !== null) {
        prefetchCollectEvidenceBlobWhenSelected(queryClient, active.id, next);
      }
      onIdChange(next);
    },
    [active.id, onIdChange, queryClient]
  );

  const jobQueueForWorkspace = useMemo(() => jobs, [jobs]);
  const jobsWs = useJobsWorkspace(active.id, {
    jobId:
      selection.focusRunId ??
      (selected?.evidence === null ? selected?.id : undefined),
    onJobIdChange: onIdChange,
    caps,
    jobs: jobQueueForWorkspace,
    queue: jobQueueForWorkspace,
    jobsListFetching,
  });

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  useEffect(() => {
    if (selection.rowId === null) return;
    prefetchCollectEvidenceBlobWhenSelected(
      queryClient,
      active.id,
      selection.rowId
    );
  }, [active.id, queryClient, selection.rowId]);

  useLiveEvents(active.id, (event) => {
    if (event.type === "job_update") {
      void invalidateAfterEvidenceMutation(queryClient, active.id);
    }
  });

  const urlSyncOutOfDate = (urlId ?? null) !== selection.rowId;

  const actionError = intake.actionError ?? jobsWs.error;
  const handleEntityIdChange = (next: string) => {
    intake.setEntityId(next);
  };
  const handleFiles = (...args: Parameters<typeof intake.onFiles>) => {
    intake.onFiles(...args);
  };
  const handlePaste = (...args: Parameters<typeof intake.onPaste>) => {
    intake.onPaste(...args);
  };
  const handleUrl = (...args: Parameters<typeof intake.onUrl>) => {
    intake.onUrl(...args);
  };

  const detailIsJobRow =
    selected !== null && selected.evidence === null && selected.runs.length > 0;
  const detailJobId = resolveCollectJobDetailId(selected, selection.focusRunId);
  const jobDetailQueryState = useQuery({
    ...jobDetailQuery(active.id, detailJobId ?? ""),
    enabled: detailJobId !== null && detailIsJobRow,
  });
  const jobDetailPending = listPending(jobDetailQueryState, {
    enabled: detailJobId !== null && detailIsJobRow,
  });
  const detailPending = collectDetailPending({
    selected,
    queueCorePending,
    detailIsJobRow,
    jobDetailPending,
  });

  return (
    <>
      {/* Sibling, not an early return — an early return here unmounts the
          toolbar + split + skeleton for a frame while the URL syncs to the
          resolved selection (e.g. auto-picking the first row on a fresh
          `/collect` visit), producing a skeleton -> blank -> content flash. */}
      {urlSyncOutOfDate ? (
        <Navigate
          to="/collect"
          search={(prev) => ({
            ...prev,
            id: selection.rowId ?? undefined,
          })}
          replace
        />
      ) : null}
      <CollectQueueToolbar
        filters={filters}
        onFiltersChange={setFilters}
        jobs={jobs}
        actions={
          <div className="flex items-stretch gap-2">
            <div className="flex items-center">
              <CollectDumpButtons
                disabled={intake.busy}
                onDump={setDumpModal}
              />
            </div>
            <Separator orientation="vertical" />
            <div className="flex items-center">
              <CollectRunPopover runMode={runMode} onRunModeChange={setRunMode}>
                {runCatalogPending ? (
                  <InlineLoading label="Loading caps and playbooks…" />
                ) : (
                  <CollectRunFormPanel
                    runMode={runMode}
                    playbooks={playbooks}
                    caps={caps}
                    urlDumps={urlDumps}
                    entities={entities}
                    allowThirdPartyEgress={active.allowThirdPartyEgress}
                    configuredCredentials={configuredCredentials}
                    runError={jobsWs.error}
                    onRunPlaybook={async (input) => {
                      await jobsWs.handleRunPlaybook(input);
                    }}
                    onRunCap={async (input) => {
                      await jobsWs.handleRunCap(input);
                    }}
                  />
                )}
              </CollectRunPopover>
            </div>
          </div>
        }
      />
      <FormInlineError>{actionError}</FormInlineError>
      <DumpDialogs
        open={dumpModal}
        onOpenChange={setDumpModal}
        busy={intake.busy}
        uploading={intake.uploading}
        dumpingPaste={intake.dumpingPaste}
        dumpingUrl={intake.dumpingUrl}
        uploadStatus={intake.uploadStatus}
        entities={entities}
        entityId={intake.entityId}
        onEntityIdChange={handleEntityIdChange}
        onFiles={handleFiles}
        onPaste={handlePaste}
        onUrl={handleUrl}
      />
      {jobsWs.stuckJobs.length > 0 ? (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertTitle>Worker may be down</AlertTitle>
          <AlertDescription>
            {jobsWs.stuckJobs.length} job
            {jobsWs.stuckJobs.length === 1 ? "" : "s"} queued or running for
            over 60s. Start the worker with{" "}
            <code className="font-mono text-xs">pnpm dev:worker</code>.
          </AlertDescription>
        </Alert>
      ) : null}
      <SplitView
        key="collect-split"
        groupId="collect"
        list={
          <QueueShell
            aria-label="Collect items"
            scrollable={!queuePending}
            header={
              <QueueHeader
                label={filters.hiddenOnly ? "Hidden" : "Items"}
                count={collectQueueCountLabel(
                  queuePending,
                  visibleRows.length,
                  index.rows.length
                )}
              />
            }
          >
            {renderCollectQueueBody({
              queuePending,
              queueLoadError,
              onRetryQueue: () => {
                if (evidenceError) {
                  void queryClient.invalidateQueries({
                    queryKey: evidenceListQuery(active.id, {
                      hiddenOnly: false,
                    }).queryKey,
                  });
                }
                if (hiddenEvidenceError) {
                  void queryClient.invalidateQueries({
                    queryKey: evidenceListQuery(active.id, { hiddenOnly: true })
                      .queryKey,
                  });
                }
                if (jobsError) {
                  void queryClient.invalidateQueries({
                    queryKey: jobsListQuery(active.id).queryKey,
                  });
                }
              },
              queuePlaceholder,
              indexRows: index.rows,
              visibleRows,
              filters,
              selectionRowId: selection.rowId,
              intakeBusy: intake.busy,
              setDumpModal,
              setFilters,
              onIdChange: handleQueueSelect,
            })}
          </QueueShell>
        }
        detail={
          <PendingRegion
            loading={detailPending}
            label="Loading collect detail"
            fallback={<CollectDetailSkeleton />}
            className="flex h-full min-h-0 flex-col"
          >
            <CollectDetail
              row={selected}
              caseId={active.id}
              evidence={evidence}
              jobs={jobs}
              entities={entities}
              entityNameById={entityNameById}
              allowThirdPartyEgress={active.allowThirdPartyEgress}
              evidenceActions={intake.evidenceActions}
              focusRunId={selection.focusRunId}
              recipeStepCountByPlaybookId={recipeStepCountByPlaybookId}
              busy={jobsWs.cancelBusy || jobsWs.cancelPlaybookBusy}
              onCancel={jobsWs.handleCancel}
              onCancelPlaybook={
                jobsWs.hasPlaybookRun ? jobsWs.handleCancelPlaybook : undefined
              }
              cancelPlaybookBusy={jobsWs.cancelPlaybookBusy}
            />
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
  const [{ data: casesCtx }] = useSuspenseQueries({
    queries: [casesContextQuery()],
  });
  const { data: caps = [], isPending: capsPending } = useQuery(
    capabilitiesListQuery()
  );
  const { data: playbooks = [], isPending: playbooksPending } =
    useQuery(playbooksListQuery());
  const runCatalogPending = capsPending || playbooksPending;

  return (
    <Page density="split">
      <PageHeader />

      {casesCtx.active ? (
        <CollectWithCase
          active={casesCtx.active}
          caps={caps}
          playbooks={playbooks}
          runCatalogPending={runCatalogPending}
          urlId={urlId}
          onIdChange={onIdChange}
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
              to collect material.
            </>
          }
        />
      )}
    </Page>
  );
}
