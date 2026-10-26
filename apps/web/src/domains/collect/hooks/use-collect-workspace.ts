import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CollectRunMode } from "@/domains/collect/components/collect-run-mode-toggle";
import { useCollectSelection } from "@/domains/collect/hooks/use-collect-selection";
import { collectDetailPending } from "@/domains/collect/lib/collect-detail-pending";
import {
  resolveCollectJobDetailId,
  resolveCollectRecipeTotal,
} from "@/domains/collect/lib/collect-job-detail";
import {
  collectCatalogFromPlaybooks,
  collectRowOf,
} from "@/domains/collect/lib/collect-row";
import type { CollectRunTarget } from "@/domains/collect/lib/collect-run-target";
import type {
  CollectSearch,
  CollectSearchPatch,
} from "@/domains/collect/lib/collect-search";
import { prefetchCollectEvidenceBlob } from "@/domains/collect/lib/prefetch-collect";
import { collectListView } from "@/domains/collect/queries";
import { entityOptionsFromRecords } from "@/domains/entities/lib/entity-options";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { DumpModal } from "@/domains/intake/components/dump-dialogs";
import { useIntakeActions } from "@/domains/intake/hooks/use-intake-actions";
import { urlDumpsQuery } from "@/domains/intake/queries";
import { useJobsWorkspace } from "@/domains/jobs/hooks/use-jobs-workspace";
import {
  capRunPrefillFromJob,
  type CapRunPrefill,
} from "@/domains/jobs/lib/cap-run-input";
import type { CapListItem, PlaybookListItem } from "@/domains/jobs/types";
import {
  credentialsKeys,
  credentialsListQuery,
} from "@/domains/settings/queries";
import { useList } from "@/shared/hooks/list/use-list";
import { listPending } from "@/shared/lib/list-pending";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { queryLoadError } from "@/shared/lib/query-load-error";
import type { CollectQueueItem, JobListRecord } from "@watchdog/core/jobs";
import { entitySearchHaystackMapFromRows } from "@watchdog/schemas/graph";

const EMPTY_ENTITY_RECORDS: never[] = [];
const EMPTY_URL_DUMPS: never[] = [];
const EMPTY_CREDENTIAL_SLOTS: never[] = [];

export type UseCollectWorkspaceOptions = {
  caseId: string;
  caps: CapListItem[];
  playbooks: PlaybookListItem[];
  /** The route's validated search: the queue's view, `id` and the one-shot `run`. */
  search: CollectSearch;
  /** The route's `usePatchSearch` writer. */
  onSearchChange: (patch: CollectSearchPatch) => void;
  /** Open the Run form on this Cap or Playbook (a link from the Library). */
  runTarget?: CollectRunTarget;
};

function titleMap(titles: Readonly<Record<string, string>>) {
  return new Map(Object.entries(titles));
}

/**
 * The Collect screen's state: the queue (`useList` over `collectList`, a page at a time, its view
 * in the URL), the selection (`?id=`, the first row when absent; an id the loaded pages lack is
 * read by id), the selected row's Detail and the Ingress actions (dump, Run a Cap or Playbook).
 */
export function useCollectWorkspace({
  caseId,
  caps,
  playbooks,
  search,
  onSearchChange,
  runTarget,
}: UseCollectWorkspaceOptions) {
  const queryClient = useQueryClient();
  const catalog = useMemo(
    () => collectCatalogFromPlaybooks(playbooks),
    [playbooks]
  );

  // The hidden view holds Evidence only: the selected id (a live row) means nothing there.
  const handleListSearchChange = useCallback(
    (patch: CollectSearchPatch) => {
      onSearchChange(
        patch.hidden === search.hidden ? patch : { ...patch, id: undefined }
      );
    },
    [onSearchChange, search.hidden]
  );
  const list = useList(collectListView, {
    scope: { caseId },
    search,
    onSearchChange: handleListSearchChange,
  });
  const isHiddenView = list.query.filters.hidden;
  const urlId = scopeOptionalUuid(search.id) ?? null;
  const clearId = useCallback(() => {
    onSearchChange({ id: undefined });
  }, [onSearchChange]);

  // The row the user was on when they picked a Job inside it (a run's step, an attempt).
  const [anchorRowId, setAnchorRowId] = useState<string | null>(null);
  const selection = useCollectSelection({
    caseId,
    urlId,
    items: list.rows,
    isListSettled: list.status !== "pending",
    isHiddenView,
    anchorRowId,
    onClear: clearId,
  });
  const selectedItem = selection.item;
  const selected = useMemo(
    () => (selectedItem === null ? null : collectRowOf(selectedItem, catalog)),
    [selectedItem, catalog]
  );
  const rows = useMemo(
    () => list.rows.map((item) => collectRowOf(item, catalog)),
    [list.rows, catalog]
  );
  const liveJobs = useMemo(
    () => list.rows.flatMap((item) => item.jobs),
    [list.rows]
  );

  const [dumpModal, setDumpModal] = useState<DumpModal | null>(null);
  const [runMode, setRunMode] = useState<CollectRunMode>(
    runTarget?.kind ?? "cap"
  );
  const [isRunOpen, setIsRunOpen] = useState(runTarget !== undefined);

  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const entityRecords = entitiesQuery.data ?? EMPTY_ENTITY_RECORDS;
  const entities = useMemo(
    () => entityOptionsFromRecords(entityRecords),
    [entityRecords]
  );
  const entityNameById = useMemo(
    () => entitySearchHaystackMapFromRows(entityRecords),
    [entityRecords]
  );
  const urlDumpsRead = useQuery(urlDumpsQuery(caseId, isRunOpen));
  const urlDumps = urlDumpsRead.data ?? EMPTY_URL_DUMPS;
  const credentialsQuery = useQuery(credentialsListQuery());
  const configuredCredentials = useMemo(() => {
    const names = new Set<string>();
    for (const slot of credentialsQuery.data ?? EMPTY_CREDENTIAL_SLOTS) {
      if (slot.configured) names.add(slot.name);
    }
    return names;
  }, [credentialsQuery.data]);
  const credentialsPending = listPending(credentialsQuery);
  const credentialsLoadError = queryLoadError(
    credentialsQuery,
    credentialsPending,
    "Failed to load credentials"
  );
  const credentialsError = credentialsQuery.isError;

  const resolveSelectionAfterHide = useCallback(
    (hiddenEvidenceId: string): string | null => {
      const at = list.rows.findIndex(
        (item) => item.evidence?.id === hiddenEvidenceId
      );
      if (at === -1) return null;
      const next = list.rows[at + 1] ?? list.rows[at - 1] ?? null;
      return next?.id ?? null;
    },
    [list.rows]
  );

  const intake = useIntakeActions({
    caseId,
    selectedEvidenceId: selected?.evidence?.id ?? null,
    onEvidenceIdChange: (next) => {
      setAnchorRowId(null);
      onSearchChange({ id: next ?? undefined });
    },
    resolveSelectionAfterHide,
    closeDumpModal: () => {
      setDumpModal(null);
    },
    onRestoreShowActiveQueue: () => {
      onSearchChange({ hidden: undefined });
    },
  });

  const handleQueueSelect = useCallback(
    (next: string) => {
      const picked = list.rows.find((item) => item.id === next);
      if (picked?.evidence !== undefined && picked.evidence !== null) {
        prefetchCollectEvidenceBlob(queryClient, caseId, picked.evidence);
      }
      setAnchorRowId(null);
      onSearchChange({ id: next });
    },
    [caseId, list.rows, onSearchChange, queryClient]
  );
  // A step or an attempt of the selected row: the row stays, the Job comes into focus.
  const handleJobSelect = useCallback(
    (jobId: string) => {
      setAnchorRowId(selectedItem?.id ?? null);
      onSearchChange({ id: jobId });
    },
    [onSearchChange, selectedItem]
  );

  const rowJobs = useMemo<readonly JobListRecord[]>(
    () => selectedItem?.jobs ?? [],
    [selectedItem]
  );
  const jobsWs = useJobsWorkspace(caseId, {
    jobId: resolveCollectJobDetailId(selected, selection.focusJobId),
    onJobIdChange: (next) => {
      setAnchorRowId(null);
      onSearchChange({ id: next ?? undefined });
    },
    caps,
    rowJobs,
    liveJobs,
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

  const selectedEvidence = selected?.evidence ?? null;
  useEffect(() => {
    if (selectedEvidence === null) return;
    prefetchCollectEvidenceBlob(queryClient, caseId, selectedEvidence);
  }, [caseId, queryClient, selectedEvidence]);

  const recipeTotal = useMemo(
    () => resolveCollectRecipeTotal(selected, catalog.recipeStepsByPlaybookId),
    [selected, catalog]
  );

  const detailIsJobRow =
    selected !== null && selected.evidence === null && selected.runs.length > 0;
  const detailPending = collectDetailPending({
    selected,
    isQueueCorePending:
      selected === null && (list.status === "pending" || selection.isLoading),
    isJobRowDetail: detailIsJobRow,
    isJobDetailPending: jobsWs.detailPending,
  });

  const retryCredentials = useCallback(() => {
    if (!credentialsError) return;
    void queryClient.invalidateQueries({ queryKey: credentialsKeys.all });
  }, [credentialsError, queryClient]);

  const selectedTitles: CollectQueueItem["titles"] = selectedItem?.titles ?? {
    evidence: {},
    entity: {},
  };
  const evidenceTitleById = useMemo(
    () => titleMap(selectedTitles.evidence),
    [selectedTitles.evidence]
  );
  const entityTitleById = useMemo(
    () => titleMap(selectedTitles.entity),
    [selectedTitles.entity]
  );

  return {
    list,
    rows,
    isHiddenView,
    dumpModal,
    setDumpModal,
    runMode,
    setRunMode,
    rerun,
    initialPlaybookId: playbookId,
    isRunOpen,
    handleRunOpenChange,
    handleEditAndRerun,
    entities,
    urlDumps,
    configuredCredentials,
    credentialsLoadError,
    credentialsPending,
    selectedId: selection.selectedId,
    selected,
    focusJobId: selection.focusJobId,
    selectionError: selection.error,
    retrySelection: selection.retry,
    clearSelection: clearId,
    /** No `?id=` yet while a first row stands selected: the screen writes it. */
    selectionOutOfSync:
      urlId === null &&
      selection.selectedId !== null &&
      list.status === "ready" &&
      !list.isUpdating,
    entityNameById,
    entityTitleById,
    evidenceTitleById,
    recipeTotal,
    detailPending,
    detailPlaceholder: detailIsJobRow ? jobsWs.detailPlaceholder : false,
    actionError: intake.actionError ?? jobsWs.error,
    intake,
    jobsWs,
    handleQueueSelect,
    handleJobSelect,
    retryCredentials,
  };
}
