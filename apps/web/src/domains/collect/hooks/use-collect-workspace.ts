import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CollectRunMode } from "@/domains/collect/components/collect-action-controls";
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
import { prefetchCollectEvidenceBlobWhenSelected } from "@/domains/collect/lib/prefetch-collect";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { DumpModal } from "@/domains/intake/components/dump-dialogs";
import { useIntakeActions } from "@/domains/intake/hooks/use-intake-actions";
import { evidenceListQuery } from "@/domains/intake/queries";
import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";
import { normalizedPlaybookRunId } from "@/domains/jobs/lib/status";
import { jobsListQuery } from "@/domains/jobs/queries";
import type {
  CapListItem,
  JobListRecord,
  PlaybookListItem,
} from "@/domains/jobs/types";
import { credentialsKeys } from "@/domains/settings/queries";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import {
  bindCasesChangedInvalidation,
  invalidateAfterEntityChanged,
  invalidateAfterEvidenceMutation,
  invalidateAfterJobMutation,
} from "@/shared/lib/query-invalidation";
import {
  entitySearchHaystackMapFromRows,
  entityTitleMapForJobInputs,
  trimmedOrNull,
} from "@watchdog/schemas";

import { useCollectQueueData } from "./use-collect-queue-data";

const EMPTY_JOBS: JobListRecord[] = [];

export interface UseCollectWorkspaceOptions {
  caseId: string;
  caps: CapListItem[];
  playbooks: PlaybookListItem[];
  urlId?: string;
  onIdChange: (next: string | null) => void;
}
export function useCollectWorkspace({
  caseId,
  caps,
  playbooks,
  urlId,
  onIdChange,
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
  const [runMode, setRunMode] = useState<CollectRunMode>("cap");

  const collectIndexOpts = useMemo(
    () => collectIndexOptionsFromPlaybooks(playbooks),
    [playbooks]
  );
  const recipeStepCountByPlaybookId = collectIndexOpts.recipeStepsByPlaybookId;

  const indexJobs = useMemo(
    () => (filters.hiddenOnly ? EMPTY_JOBS : jobs),
    [filters.hiddenOnly, jobs]
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
        holdMissingId:
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
      setFilters((prev) => ({ ...prev, hiddenOnly: false }));
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
    jobsListFetching,
    live: false,
  });

  useEffect(() => bindCasesChangedInvalidation(queryClient), [queryClient]);

  useEffect(() => {
    if (selection.rowId === null) return;
    prefetchCollectEvidenceBlobWhenSelected(
      queryClient,
      caseId,
      selection.rowId
    );
  }, [caseId, queryClient, selection.rowId]);

  useLiveEvents(caseId, (event) => {
    if (event.type === "job_update") {
      void invalidateAfterJobMutation(queryClient, caseId);
    }
    if (event.type === "evidence_changed") {
      void invalidateAfterEvidenceMutation(queryClient, caseId);
    }
    if (event.type === "entity_changed") {
      void invalidateAfterEntityChanged(queryClient, caseId);
    }
  });

  const urlSyncOutOfDate =
    trimmedOrNull(urlId) !== selection.rowId &&
    trimmedOrNull(urlId) !== selection.focusRunId;

  const actionError = intake.actionError ?? jobsWs.error;

  const recipeTotal = useMemo(
    () => resolveCollectRecipeTotal(selected, recipeStepCountByPlaybookId),
    [selected, recipeStepCountByPlaybookId]
  );

  const detailIsJobRow =
    selected !== null && selected.evidence === null && selected.runs.length > 0;
  const detailIsEvidenceRow = selected?.evidence !== null;
  const evidenceDetailPlaceholder =
    detailIsEvidenceRow &&
    (filters.hiddenOnly ? hiddenEvidencePlaceholder : evidencePlaceholder);
  const detailPending = collectDetailPending({
    selected,
    queueCorePending,
    detailIsJobRow,
    jobDetailPending: jobsWs.detailPending,
  });
  const detailPlaceholder = detailIsJobRow
    ? jobsWs.detailPlaceholder
    : evidenceDetailPlaceholder;

  const retryQueue = useCallback(() => {
    if (filters.hiddenOnly) {
      if (hiddenEvidenceError) {
        void queryClient.invalidateQueries({
          queryKey: evidenceListQuery(caseId, { hiddenOnly: true }).queryKey,
        });
      }
      return;
    }
    if (evidenceError) {
      void queryClient.invalidateQueries({
        queryKey: evidenceListQuery(caseId, {
          hiddenOnly: false,
        }).queryKey,
      });
    }
    if (hiddenEvidenceError) {
      void queryClient.invalidateQueries({
        queryKey: evidenceListQuery(caseId, { hiddenOnly: true }).queryKey,
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
    filters.hiddenOnly,
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
