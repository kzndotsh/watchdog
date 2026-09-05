import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  EMPTY_COLLECT_FILTERS,
  type CollectFilters,
} from "@/domains/collect/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { sortJobQueue } from "@/domains/jobs/lib/status";
import { jobsListQuery } from "@/domains/jobs/queries";
import type { PlaybookListItem } from "@/domains/jobs/types";
import { credentialsListQuery } from "@/domains/settings/queries";
import { errMessage } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";

export interface CollectUrlDump {
  id: string;
  sourceUrl: string;
  label: string | null;
}
export function useCollectQueueData(
  caseId: string,
  playbooks: PlaybookListItem[]
) {
  const evidenceQuery = useQuery(
    evidenceListQuery(caseId, { hiddenOnly: false })
  );
  const hiddenEvidenceQuery = useQuery(
    evidenceListQuery(caseId, { hiddenOnly: true })
  );
  const jobsQuery = useQuery(jobsListQuery(caseId));
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
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
  const { data: entities = [] } = entitiesQuery;

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

  const evidence = filters.hiddenOnly ? hiddenEvidenceRows : evidenceRows;
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
  const urlDumps = useMemo((): CollectUrlDump[] => {
    const dumps: CollectUrlDump[] = [];
    for (const row of evidenceRows) {
      const sourceUrl = row.sourceUrl?.trim();
      if (sourceUrl === undefined || sourceUrl === "") continue;
      dumps.push({ id: row.id, sourceUrl, label: row.label });
    }
    return dumps;
  }, [evidenceRows]);

  return {
    filters,
    setFilters,
    evidence,
    evidenceRows,
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
  };
}
