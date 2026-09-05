import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { collectDetailPending } from "@/domains/collect/lib/collect-detail-pending";
import {
  filterCollectRows,
  resolveCollectSelection,
} from "@/domains/collect/lib/collect-filters";
import { buildCollectIndex } from "@/domains/collect/lib/collect-index";
import { resolveCollectJobDetailId } from "@/domains/collect/lib/collect-job-detail";
import { prefetchCollectEvidenceBlobWhenSelected } from "@/domains/collect/lib/prefetch-collect";
import type { DumpModal } from "@/domains/intake/components/dump-dialogs";
import { useIntakeActions } from "@/domains/intake/hooks/use-intake-actions";
import { evidenceListQuery } from "@/domains/intake/queries";
import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";
import { jobDetailQuery, jobsListQuery } from "@/domains/jobs/queries";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import {
  bindCasesChangedInvalidation,
  invalidateAfterEvidenceMutation,
} from "@/shared/lib/query-invalidation";

import { useCollectQueueData } from "./use-collect-queue-data";

/** Mirrors CollectRunMode in collect-action-controls (UI toggle). */
type CollectRunMode = "cap" | "playbook";

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
  const queue = useCollectQueueData(caseId, playbooks);
  const {
    filters,
    setFilters,
    evidence,
    jobs,
    entities,
    urlDumps,
    configuredCredentials,
    recipeStepCountByPlaybookId,
    queueCorePending,
    queuePending,
    queuePlaceholder,
    queueLoadError,
    jobsListFetching,
    evidenceError,
    hiddenEvidenceError,
    jobsError,
  } = queue;

  const [dumpModal, setDumpModal] = useState<DumpModal | null>(null);
  const [runMode, setRunMode] = useState<CollectRunMode>("cap");

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
    caseId,
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
        prefetchCollectEvidenceBlobWhenSelected(queryClient, caseId, next);
      }
      onIdChange(next);
    },
    [caseId, onIdChange, queryClient]
  );

  const jobsWs = useJobsWorkspace(caseId, {
    jobId:
      selection.focusRunId ??
      (selected?.evidence === null ? selected?.id : undefined),
    onJobIdChange: onIdChange,
    caps,
    jobs,
    queue: jobs,
    jobsListFetching,
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
      void invalidateAfterEvidenceMutation(queryClient, caseId);
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
    ...jobDetailQuery(caseId, detailJobId ?? ""),
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

  const retryQueue = useCallback(() => {
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
  }, [caseId, evidenceError, hiddenEvidenceError, jobsError, queryClient]);

  return {
    filters,
    setFilters,
    dumpModal,
    setDumpModal,
    runMode,
    setRunMode,
    evidence,
    jobs,
    entities,
    urlDumps,
    configuredCredentials,
    recipeStepCountByPlaybookId,
    indexRows: index.rows,
    visibleRows,
    selection,
    selected,
    entityNameById,
    queuePending,
    queuePlaceholder,
    queueLoadError,
    detailPending,
    urlSyncOutOfDate,
    actionError,
    intake,
    jobsWs,
    handleQueueSelect,
    handleEntityIdChange,
    handleFiles,
    handlePaste,
    handleUrl,
    retryQueue,
  };
}
