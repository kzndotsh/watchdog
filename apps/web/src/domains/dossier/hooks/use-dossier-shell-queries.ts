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

export interface DossierTabCounts {
  claims: number;
  identifiers: number;
  connections: number;
  evidence: number;
  events: number;
  questions: number;
  tasks: number;
}

function evidenceRecordMap(
  evidenceAll: EvidenceRecord[]
): Map<string, EvidenceRecord> {
  return new Map(evidenceAll.map((entry) => [entry.id, entry]));
}

function dossierTabCounts(
  claimsRaw: { retracted: boolean }[],
  identifiers: unknown[],
  edges: unknown[],
  events: unknown[],
  questions: { status: string }[],
  evidenceAll: { entityId: string | null }[],
  entityId: string,
  entityTasks: { status: string }[]
): DossierTabCounts {
  return {
    claims: claimsRaw.filter((claim) => !claim.retracted).length,
    identifiers: identifiers.length,
    connections: edges.length,
    events: events.length,
    questions: questions.filter((question) => question.status === "open")
      .length,
    evidence: evidenceAll.filter((entry) => entry.entityId === entityId).length,
    tasks: entityTasks.filter(
      (task) => task.status !== "done" && task.status !== "dropped"
    ).length,
  };
}

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

  const claimsRaw = claimsQuery.data ?? [];
  const identifiers = identifiersQuery.data ?? [];
  const edges = edgesQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const questions = questionsQuery.data ?? [];
  const entityTasks = entityTasksQuery.data ?? [];
  const evidenceAll = evidenceQuery.data ?? [];
  const evidencePending = evidenceQuery.isPending;

  const countsPending =
    claimsQuery.isPending ||
    identifiersQuery.isPending ||
    edgesQuery.isPending ||
    eventsQuery.isPending ||
    questionsQuery.isPending ||
    entityTasksQuery.isPending ||
    evidenceQuery.isPending;

  const [previewEvidence, setPreviewEvidence] = useState<EvidenceRecord | null>(
    null
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const evidenceMap = useMemo(
    () => evidenceRecordMap(evidenceQuery.data ?? []),
    [evidenceQuery.data]
  );

  const handleEvidenceClick = useCallback(
    (evId: string) => {
      const ev = evidenceMap.get(evId);
      if (ev) setPreviewEvidence(ev);
    },
    [evidenceMap]
  );

  const counts = useMemo(
    () =>
      dossierTabCounts(
        claimsQuery.data ?? [],
        identifiersQuery.data ?? [],
        edgesQuery.data ?? [],
        eventsQuery.data ?? [],
        questionsQuery.data ?? [],
        evidenceQuery.data ?? [],
        entity.id,
        entityTasksQuery.data ?? []
      ),
    [
      claimsQuery.data,
      identifiersQuery.data,
      edgesQuery.data,
      eventsQuery.data,
      questionsQuery.data,
      evidenceQuery.data,
      entity.id,
      entityTasksQuery.data,
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
