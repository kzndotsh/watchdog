import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { evidenceByIdQuery, evidenceListView } from "@/domains/intake/queries";
import { taskBoardQuery } from "@/domains/tasks/queries";
import { useListCount } from "@/shared/hooks/list/use-list-count";
import { anyQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";

import {
  anyQueryPending,
  dataOrEmpty,
  dossierTabCounts,
} from "./dossier-shell-query-helpers";

export function useDossierShellQueries(caseId: string, entity: EntityRecord) {
  const queryClient = useQueryClient();

  const claimsQuery = useQuery(claimsListQuery(caseId, entity.id));
  const edgesQuery = useQuery(edgesListQuery(caseId, entity.id));
  const eventsQuery = useQuery(eventsListQuery(caseId, entity.id));
  const questionsQuery = useQuery(questionsListQuery(caseId, entity.id));
  // The tab counts the Entity's open Tasks: the board's own read for this Entity (capped).
  const entityTasksQuery = useQuery(
    taskBoardQuery(caseId, { entityId: entity.id })
  );
  const identifierCount = useListCount(
    identifierListView,
    { caseId },
    identifierList.queryOf({}, { entityId: entity.id })
  );
  const evidenceCount = useListCount(
    evidenceListView,
    { caseId },
    evidenceList.queryOf({}, { entityId: entity.id })
  );

  const claimsRaw = dataOrEmpty(claimsQuery.data);
  const edges = dataOrEmpty(edgesQuery.data);
  const events = dataOrEmpty(eventsQuery.data);
  const questions = dataOrEmpty(questionsQuery.data);
  const openTasks = entityTasksQuery.data?.items.length ?? 0;

  const countedQueries = [
    claimsQuery,
    edgesQuery,
    eventsQuery,
    questionsQuery,
    entityTasksQuery,
  ];
  const countsPending = anyQueryPending(countedQueries);
  const countsPlaceholder = anyQueryPlaceholderData(countedQueries);

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

  const counts = useMemo(
    () => dossierTabCounts(claimsRaw, edges, events, questions, openTasks),
    [claimsRaw, edges, events, questions, openTasks]
  );

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
    counts,
    identifierCount,
    evidenceCount,
    countsPending,
    countsPlaceholder,
  };
}
