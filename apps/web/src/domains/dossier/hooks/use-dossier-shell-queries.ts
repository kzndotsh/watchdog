import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import type { DossierTab } from "@/domains/dossier/lib/dossier-tabs";
import { claimsListQuery } from "@/domains/entities/claims/queries";
import { edgesListQuery } from "@/domains/entities/edges/queries";
import { eventsListQuery } from "@/domains/entities/events/queries";
import { identifierListView } from "@/domains/entities/identifiers/queries";
import { questionsListQuery } from "@/domains/entities/questions/queries";
import type { EntityRecord } from "@/domains/entities/types";
import {
  evidenceTitleMapFromRecords,
  mergeEvidenceRecords,
} from "@/domains/intake/lib/evidence";
import { evidenceListQuery, evidenceListView } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { tasksListQuery } from "@/domains/tasks/queries";
import { useListCount } from "@/shared/hooks/list/use-list-count";
import { anyQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import { evidenceList } from "@watchdog/schemas/evidence";
import { identifierList } from "@watchdog/schemas/graph";

import {
  anyQueryPending,
  dataOrEmpty,
  dossierTabCounts,
  evidenceRecordMap,
  openEvidencePreview,
} from "./dossier-shell-query-helpers";

/**
 * The tabs whose sections pick or name Evidence (Claims, Identifiers and Connections, and the
 * Overview that holds all three): only they read the Case's Evidence for their pickers. The
 * Evidence tab itself is a list a page at a time.
 */
const EVIDENCE_PICKER_TABS: ReadonlySet<DossierTab> = new Set([
  "overview",
  "claims",
  "identifiers",
  "connections",
]);

export function needsEvidencePicker(tab: DossierTab): boolean {
  return EVIDENCE_PICKER_TABS.has(tab);
}

export function useDossierShellQueries(
  caseId: string,
  entity: EntityRecord,
  tab: DossierTab
) {
  const queryClient = useQueryClient();

  const claimsQuery = useQuery(claimsListQuery(caseId, entity.id));
  const edgesQuery = useQuery(edgesListQuery(caseId, entity.id));
  const eventsQuery = useQuery(eventsListQuery(caseId, entity.id));
  const questionsQuery = useQuery(questionsListQuery(caseId, entity.id));
  const entityTasksQuery = useQuery(
    tasksListQuery(caseId, { entityId: entity.id })
  );
  const isPickerTab = needsEvidencePicker(tab);
  const activeEvidenceQuery = useQuery({
    ...evidenceListQuery(caseId),
    enabled: isPickerTab && evidenceListQuery(caseId).enabled,
  });
  const hiddenEvidenceQuery = useQuery({
    ...evidenceListQuery(caseId, { isHiddenOnly: true }),
    enabled: isPickerTab && evidenceListQuery(caseId).enabled,
  });
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
  const entityTasks = dataOrEmpty(entityTasksQuery.data);
  const evidenceAll = useMemo(
    () =>
      mergeEvidenceRecords(activeEvidenceQuery.data, hiddenEvidenceQuery.data),
    [activeEvidenceQuery.data, hiddenEvidenceQuery.data]
  );

  const countedQueries = [
    claimsQuery,
    edgesQuery,
    eventsQuery,
    questionsQuery,
    entityTasksQuery,
  ];
  const countsPending = anyQueryPending(countedQueries);
  const countsPlaceholder = anyQueryPlaceholderData(countedQueries);

  const [previewEvidence, setPreviewEvidence] = useState<EvidenceRecord | null>(
    null
  );
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [renameError, setRenameError] = useState<string | null>(null);

  const evidenceMap = useMemo(
    () => evidenceRecordMap(evidenceAll),
    [evidenceAll]
  );

  const evidenceTitleById = useMemo(
    () => evidenceTitleMapFromRecords([...evidenceMap.values()]),
    [evidenceMap]
  );

  const handleEvidenceClick = useCallback(
    (evId: string) => {
      openEvidencePreview(evidenceMap, evId, setPreviewEvidence);
    },
    [evidenceMap]
  );

  const counts = useMemo(
    () => dossierTabCounts(claimsRaw, edges, events, questions, entityTasks),
    [claimsRaw, edges, events, questions, entityTasks]
  );

  return {
    queryClient,
    evidenceAll,
    previewEvidence,
    setPreviewEvidence,
    isEditOpen,
    setEditOpen: setIsEditOpen,
    editError,
    setEditError,
    renameError,
    setRenameError,
    evidenceTitleById,
    handleEvidenceClick,
    counts,
    identifierCount,
    evidenceCount,
    countsPending,
    countsPlaceholder,
  };
}
