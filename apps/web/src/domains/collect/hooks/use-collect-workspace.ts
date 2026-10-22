import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CollectRunMode } from "@/domains/collect/components/collect-run-mode-toggle";
import { collectDetailPending } from "@/domains/collect/lib/collect-detail-pending";
import {
  evidenceSearchHaystackByIdFromRecords,
  filterCollectRows,
  resolveCollectSelection,
} from "@/domains/collect/lib/collect-filters";
import {
  buildCollectIndex,
  collectIndexOptionsFromPlaybooks,
} from "@/domains/collect/lib/collect-index";
import {
  resolveCollectJobDetailId,
  resolveCollectRecipeTotal,
} from "@/domains/collect/lib/collect-job-detail";
import type { CollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import { prefetchCollectEvidenceBlobWhenSelected } from "@/domains/collect/lib/prefetch-collect";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { DumpModal } from "@/domains/intake/components/dump-dialogs";
import { useIntakeActions } from "@/domains/intake/hooks/use-intake-actions";
import { evidenceListQuery } from "@/domains/intake/queries";
import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";
import {
  capRunPrefillFromJob,
  type CapRunPrefill,
} from "@/domains/jobs/lib/cap-run-input";
import { normalizedPlaybookRunId } from "@/domains/jobs/lib/status";
import { jobsListQuery } from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { credentialsKeys } from "@/domains/settings/queries";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import type { JobListRecord } from "@watchdog/core/jobs";
import { entitySearchHaystackMapFromRows } from "@watchdog/schemas/graph";
import { entityTitleMapForJobInputs } from "@watchdog/schemas/jobs";
import { trimmedOrNull } from "@watchdog/schemas/shared";

import { useCollectQueueData } from "./use-collect-queue-data";

const EMPTY_JOBS: JobListRecord[] = [];

export type UseCollectWorkspaceOptions = {
  caseId: string;
  caps: CapListItem[];
  playbooks: PlaybookListItem[];
  urlId?: string;
  onIdChange: (next: string | null) => void;
  /** Open the Run form on this Cap or Playbook (a link from the Library). */
  runTarget?: CollectRunTarget;
};
export function useCollectWorkspace({
  caseId,
  caps,
  playbooks,
  urlId,
  onIdChange,
  runTarget,
}: UseCollectWorkspaceOptions) {
  const queryClient = useQueryClient();
  const queue = useCollectQueueData(caseId);
  const {
    filters,
    setFilters,
    evidence,
    evidenceRows,
    hiddenEvidenceRows,
    evidenceTitleById,
    jobs,
    entities,
    urlDumps,
    configuredCredentials,
    credentialsLoadError,
    credentialsError,
    credentialsPending,
    queueCorePending,
    queuePending,
    queuePlaceholder,
    evidencePlaceholder,
    hiddenEvidencePlaceholder,
    queueLoadError,
    jobsListFetching,
    evidenceError,
    hiddenEvidenceError,
    jobsError,
    entitiesError,
  } = queue;

  const [dumpModal, setDumpModal] = useState<DumpModal | null>(null);
  const [runMode, setRunMode] = useState<CollectRunMode>(
    runTarget?.kind ?? "cap"
  );

  const collectIndexOpts = useMemo(
    () => collectIndexOptionsFromPlaybooks(playbooks),
    [playbooks]
  );
  const recipeStepCountByPlaybookId = collectIndexOpts.recipeStepsByPlaybookId;

  const indexJobs = useMemo(
    () => (filters.isHiddenOnly ? EMPTY_JOBS : jobs),
    [filters.isHiddenOnly, jobs]
  );
  const entityTitleById = useMemo(
    () =>
      entityTitleMapForJobInputs(
        entities,
        indexJobs.map((job) => job.input)
      ),
    [entities, indexJobs]
  );
  const index = useMemo(
    () =>
      buildCollectIndex(evidence, indexJobs, {
        ...collectIndexOpts,
        evidenceTitleById,
        entityTitleById,
      }),
    [evidence, indexJobs, collectIndexOpts, evidenceTitleById, entityTitleById]
  );
  const entityNameById = useMemo(
    () => entitySearchHaystackMapFromRows(entities),
    [entities]
  );
  const evidenceSearchById = useMemo(
    () =>
      evidenceSearchHaystackByIdFromRecords([
        ...evidenceRows,
        ...hiddenEvidenceRows,
      ]),
    [evidenceRows, hiddenEvidenceRows]
  );
  const visibleRows = useMemo(
    () =>
      filterCollectRows(index.rows, filters, {
        entityLabelById: entityNameById,
        entityTitleById,
        evidenceTitleById,
        evidenceSearchById,
      }),
    [
      index.rows,
      filters,
      entityNameById,
      entityTitleById,
      evidenceTitleById,
      evidenceSearchById,
    ]
  );
  const selection = useMemo(() => {
    const normalizedUrlId = scopeOptionalUuid(urlId);
    return resolveCollectSelection(
      urlId,
      (id: string) => index.rowById(id),
      visibleRows,
      {
        shouldHoldMissingId:
          jobsListFetching ||
          (normalizedUrlId !== undefined &&
            jobs.some(
              (job) =>
                job.id === normalizedUrlId ||
                normalizedPlaybookRunId(job.playbookRunId) === normalizedUrlId
            )),
      }
    );
  }, [urlId, index, visibleRows, jobsListFetching, jobs]);
  const selected = useMemo(
    () => (selection.rowId === null ? null : index.rowById(selection.rowId)),
    [index, selection.rowId]
  );

  const entityOptions = useMemo(
    () => entityOptionsFromRecords(entities),
    [entities]
  );

  const resolveSelectionAfterHide = useCallback(
    (hiddenEvidenceId: string): string | null => {
      const visibleIdx = visibleRows.findIndex(
        (row) => row.evidence?.id === hiddenEvidenceId
      );
      if (visibleIdx === -1) return null;
      const next =
        visibleRows[visibleIdx + 1] ?? visibleRows[visibleIdx - 1] ?? null;
      return next?.id ?? null;
    },
    [visibleRows]
  );

  const intake = useIntakeActions({
    caseId,
    selectedEvidenceId: selected?.evidence?.id ?? null,
    onEvidenceIdChange: onIdChange,
    resolveSelectionAfterHide,
    closeDumpModal: () => {
      setDumpModal(null);
    },
    onRestoreShowActiveQueue: () => {
      setFilters((prev) => ({ ...prev, isHiddenOnly: false }));
    },
  });

  const handleQueueSelect = useCallback(
    (next: string | null) => {
      if (next !== null) {
        prefetchCollectEvidenceBlobWhenSelected(queryClient, caseId, next);
      }
      onIdChange(next);
    },
    [caseId, onIdChange, queryClient]
  );

  const jobsWs = useJobsWorkspace(caseId, {
    jobId: resolveCollectJobDetailId(selected, selection.focusRunId),
    onJobIdChange: onIdChange,
    caps,
    jobs,
    queue: jobs,
    isJobsListFetching: jobsListFetching,
  });

  const [rerun, setRerun] = useState<{
    prefill: CapRunPrefill;
    key: number;
  } | null>(
    runTarget?.kind === "cap"
      ? {
          prefill: { capabilityId: runTarget.id, runInput: "", entityId: "" },
          key: 1,
        }
      : null
  );
  const [playbookId, setPlaybookId] = useState(
    runTarget?.kind === "playbook" ? runTarget.id : undefined
  );
  const [isRunOpen, setIsRunOpen] = useState(runTarget !== undefined);
  // An ordinary Run must not open with the last Edit and re-run's values.
  const handleRunOpenChange = useCallback((isOpen: boolean) => {
    setIsRunOpen(isOpen);
    if (!isOpen) {
      setRerun(null);
      setPlaybookId(undefined);
    }
  }, []);
  const detailJob = jobsWs.detailJob;
  const handleEditAndRerun = useCallback(() => {
    if (detailJob === null) return;
    const cap = caps.find((c) => c.id === detailJob.capabilityId);
    setRunMode("cap");
    setRerun((prev) => ({
      prefill: capRunPrefillFromJob(detailJob, cap?.inputForm),
      key: (prev?.key ?? 0) + 1,
    }));
    setIsRunOpen(true);
  }, [caps, detailJob]);

  useEffect(() => {
    if (selection.rowId === null) return;
    prefetchCollectEvidenceBlobWhenSelected(
      queryClient,
      caseId,
      selection.rowId
    );
  }, [caseId, queryClient, selection.rowId]);

  // Only once the lists have succeeded, not merely settled: while one is pending or failed no
  // row resolves, and syncing would clear a `?id=` that a load or retry is about to select.
  const urlSyncOutOfDate =
    !queuePending &&
    queueLoadError === null &&
    trimmedOrNull(urlId) !== selection.rowId &&
    trimmedOrNull(urlId) !== selection.focusRunId;

  const actionError = intake.actionError ?? jobsWs.error;

  const recipeTotal = useMemo(
    () => resolveCollectRecipeTotal(selected, recipeStepCountByPlaybookId),
    [selected, recipeStepCountByPlaybookId]
  );

  const detailIsJobRow =
    selected !== null && selected.evidence === null && selected.runs.length > 0;
  const isEvidenceRowDetail = selected?.evidence !== null;
  const evidenceDetailPlaceholder =
    isEvidenceRowDetail &&
    (filters.isHiddenOnly ? hiddenEvidencePlaceholder : evidencePlaceholder);
  const detailPending = collectDetailPending({
    selected,
    isQueueCorePending: queueCorePending,
    isJobRowDetail: detailIsJobRow,
    isJobDetailPending: jobsWs.detailPending,
  });
  const detailPlaceholder = detailIsJobRow
    ? jobsWs.detailPlaceholder
    : evidenceDetailPlaceholder;

  const retryQueue = useCallback(() => {
    if (filters.isHiddenOnly) {
      if (hiddenEvidenceError) {
        void queryClient.invalidateQueries({
          queryKey: evidenceListQuery(caseId, { isHiddenOnly: true }).queryKey,
        });
      }
      return;
    }
    if (evidenceError) {
      void queryClient.invalidateQueries({
        queryKey: evidenceListQuery(caseId, {
          isHiddenOnly: false,
        }).queryKey,
      });
    }
    if (hiddenEvidenceError) {
      void queryClient.invalidateQueries({
        queryKey: evidenceListQuery(caseId, { isHiddenOnly: true }).queryKey,
      });
    }
    if (jobsError) {
      void queryClient.invalidateQueries({
        queryKey: jobsListQuery(caseId).queryKey,
      });
    }
    if (entitiesError) {
      void queryClient.invalidateQueries({
        queryKey: entitiesListQuery(caseId).queryKey,
      });
    }
  }, [
    caseId,
    entitiesError,
    evidenceError,
    filters.isHiddenOnly,
    hiddenEvidenceError,
    jobsError,
    queryClient,
  ]);

  const retryCredentials = useCallback(() => {
    if (!credentialsError) return;
    void queryClient.invalidateQueries({ queryKey: credentialsKeys.all });
  }, [credentialsError, queryClient]);

  return {
    filters,
    setFilters,
    dumpModal,
    setDumpModal,
    runMode,
    setRunMode,
    rerun,
    initialPlaybookId: playbookId,
    isRunOpen,
    handleRunOpenChange,
    handleEditAndRerun,
    evidence,
    jobs,
    entities: entityOptions,
    urlDumps,
    configuredCredentials,
    credentialsLoadError,
    credentialsPending,
    recipeStepCountByPlaybookId,
    indexRows: index.rows,
    visibleRows,
    selection,
    selected,
    entityNameById,
    entityTitleById,
    evidenceTitleById,
    recipeTotal,
    queuePending,
    queuePlaceholder,
    queueLoadError,
    detailPending,
    detailPlaceholder,
    urlSyncOutOfDate,
    actionError,
    intake,
    jobsWs,
    handleQueueSelect,
    retryQueue,
    retryCredentials,
  };
}
