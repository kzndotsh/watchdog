import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { claimListView } from "@/domains/entities/claims/queries";
import { edgeListView } from "@/domains/entities/edges/queries";
import { eventListView } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { questionListView } from "@/domains/entities/questions/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { evidenceByIdQuery, evidenceListView } from "@/domains/intake/queries";
import { taskBoardCount } from "@/domains/tasks/lib/board-count";
import { taskBoardQuery } from "@/domains/tasks/queries";
import { useListCount } from "@/shared/hooks/list/use-list-count";
import { evidenceList } from "@watchdog/schemas/evidence";
import {
  claimList,
  edgeList,
  eventList,
  identifierList,
  questionList,
} from "@watchdog/schemas/graph";

/**
 * The Dossier shell's reads: each list tab's count is the first page's `total` of the tab's
 * default view (`useListCount`, the same Query key as the tab's own view, so an open tab sends
 * no second request), and the Tasks count is the board's capped read for this Entity.
 */
export function useDossierShellQueries(caseId: string, entity: EntityRecord) {
  const queryClient = useQueryClient();
  const scope = { caseId };
  const fixed = { entityId: entity.id };

  // The live Claims: the default view (retracted Claims are the `retracted` view).
  const claimCount = useListCount(
    claimListView,
    scope,
    claimList.queryOf({}, fixed)
  );
  const connectionCount = useListCount(
    edgeListView,
    scope,
    edgeList.queryOf({}, fixed)
  );
  const eventCount = useListCount(
    eventListView,
    scope,
    eventList.queryOf({}, fixed)
  );
  const questionCount = useListCount(
    questionListView,
    scope,
    questionList.queryOf({}, fixed)
  );
  const identifierCount = useListCount(
    identifierListView,
    scope,
    identifierList.queryOf({}, fixed)
  );
  const evidenceCount = useListCount(
    evidenceListView,
    scope,
    evidenceList.queryOf({}, fixed)
  );
  // The tab counts the Entity's open Tasks: the board's own read for this Entity (capped).
  const entityTasksQuery = useQuery(
    taskBoardQuery(caseId, { entityId: entity.id })
  );
  // "500+" once the board was cut at its cap (`ListCount`'s capped form).
  const taskCount = taskBoardCount(entityTasksQuery.data);

  // The preview reads its one Evidence item by id when a linked chip is clicked (#559).
  const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(
    null
  );
  const previewQuery = useQuery(evidenceByIdQuery(caseId, previewEvidenceId));
  const previewEvidence =
    previewEvidenceId === null ? null : (previewQuery.data ?? null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const closeEvidencePreview = useCallback(() => {
    setPreviewEvidenceId(null);
  }, []);

  return {
    queryClient,
    previewEvidence,
    closeEvidencePreview,
    isEditOpen,
    setEditOpen: setIsEditOpen,
    editError,
    setEditError,
    renameError,
    setRenameError,
    handleEvidenceClick: setPreviewEvidenceId,
    claimCount,
    connectionCount,
    eventCount,
    questionCount,
    identifierCount,
    evidenceCount,
    taskCount,
  };
}
