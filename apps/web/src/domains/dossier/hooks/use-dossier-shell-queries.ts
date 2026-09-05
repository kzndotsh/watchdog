import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifiersListQuery } from "@/domains/entities/identifiers/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { evidenceListQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { tasksListQuery } from "@/domains/tasks/queries";

import {
  anyQueryPending,
  dataOrEmpty,
  dossierTabCounts,
  evidenceRecordMap,
  openEvidencePreview,
} from "./dossier-shell-query-helpers";

export function useDossierShellQueries(caseId: string, entity: EntityRecord) {
  const queryClient = useQueryClient();

  const claimsQuery = useQuery(claimsListQuery(caseId, entity.id));
  const identifiersQuery = useQuery(identifiersListQuery(caseId, entity.id));
  const edgesQuery = useQuery(edgesListQuery(caseId, entity.id));
  const eventsQuery = useQuery(eventsListQuery(caseId, entity.id));
  const questionsQuery = useQuery(questionsListQuery(caseId, entity.id));
  const entityTasksQuery = useQuery(
    tasksListQuery(caseId, { entityId: entity.id })
  );
  const evidenceQuery = useQuery(evidenceListQuery(caseId));

  const claimsRaw = dataOrEmpty(claimsQuery.data);
  const identifiers = dataOrEmpty(identifiersQuery.data);
  const edges = dataOrEmpty(edgesQuery.data);
  const events = dataOrEmpty(eventsQuery.data);
  const questions = dataOrEmpty(questionsQuery.data);
  const entityTasks = dataOrEmpty(entityTasksQuery.data);
  const evidenceAll = dataOrEmpty(evidenceQuery.data);
  const evidencePending = evidenceQuery.isPending;

  const countsPending = anyQueryPending([
    claimsQuery.isPending,
    identifiersQuery.isPending,
    edgesQuery.isPending,
    eventsQuery.isPending,
    questionsQuery.isPending,
    entityTasksQuery.isPending,
    evidenceQuery.isPending,
  ]);

  const [previewEvidence, setPreviewEvidence] = useState<EvidenceRecord | null>(
    null
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const evidenceMap = useMemo(
    () => evidenceRecordMap(evidenceAll),
    [evidenceAll]
  );

  const handleEvidenceClick = useCallback(
    (evId: string) => {
      openEvidencePreview(evidenceMap, evId, setPreviewEvidence);
    },
    [evidenceMap]
  );

  const counts = useMemo(
    () =>
      dossierTabCounts(
        claimsRaw,
        identifiers,
        edges,
        events,
        questions,
        evidenceAll,
        entity.id,
        entityTasks
      ),
    [
      claimsRaw,
      identifiers,
      edges,
      events,
      questions,
      evidenceAll,
      entity.id,
      entityTasks,
    ]
  );

  return {
    queryClient,
    claimsRaw,
    identifiers,
    edges,
    events,
    questions,
    entityTasks,
    evidenceAll,
    evidencePending,
    previewEvidence,
    setPreviewEvidence,
    editOpen,
    setEditOpen,
    editError,
    setEditError,
    evidenceMap,
    handleEvidenceClick,
    counts,
    countsPending,
  };
}
