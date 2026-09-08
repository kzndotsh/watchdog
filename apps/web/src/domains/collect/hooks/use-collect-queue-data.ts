import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import {
  EMPTY_COLLECT_FILTERS,
  type CollectFilters,
} from "@/domains/collect/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import type { EntityRecord } from "@/domains/entities/types";
import { evidenceTitleMapForJobRecords } from "@/domains/intake/lib/evidence";
import { evidenceListQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { sortJobQueue } from "@/domains/jobs/lib/status";
import { jobsListQuery } from "@/domains/jobs/queries";
import type { JobListRecord } from "@/domains/jobs/types";
import { credentialsListQuery } from "@/domains/settings/queries";
import { errMessage } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import type { CredentialSlot } from "@watchdog/core";

const EMPTY_EVIDENCE_ROWS: EvidenceRecord[] = [];
const EMPTY_JOB_ROWS: JobListRecord[] = [];
const EMPTY_ENTITIES: EntityRecord[] = [];
const EMPTY_CREDENTIAL_SLOTS: CredentialSlot[] = [];

export interface CollectUrlDump {
  id: string;
  sourceUrl: string;
  label: string | null;
}
export function useCollectQueueData(caseId: string) {
  const evidenceQuery = useQuery(
    evidenceListQuery(caseId, { hiddenOnly: false })
  );
  const hiddenEvidenceQuery = useQuery(
    evidenceListQuery(caseId, { hiddenOnly: true })
  );
  const jobsQuery = useQuery(jobsListQuery(caseId));
  const entitiesQuery = useQuery(entitiesListQuery(caseId));
  const {
    data: evidenceRows = EMPTY_EVIDENCE_ROWS,
    isPlaceholderData: evidencePlaceholder,
    isError: evidenceError,
    error: evidenceLoadError,
  } = evidenceQuery;
  const {
    data: hiddenEvidenceRows = EMPTY_EVIDENCE_ROWS,
    isPlaceholderData: hiddenEvidencePlaceholder,
    isError: hiddenEvidenceError,
    error: hiddenEvidenceLoadError,
  } = hiddenEvidenceQuery;
  const {
    data: jobsRaw = EMPTY_JOB_ROWS,
    isFetching: jobsListFetching,
    isError: jobsError,
    error: jobsLoadError,
    isPlaceholderData: jobsPlaceholder,
  } = jobsQuery;
  const credentialsQuery = useQuery(credentialsListQuery());
  const {
    data: credentialSlots = EMPTY_CREDENTIAL_SLOTS,
    isPlaceholderData: credentialsPlaceholder,
    isError: credentialsError,
    error: credentialsLoadError,
  } = credentialsQuery;
  const {
    data: entities = EMPTY_ENTITIES,
    isPlaceholderData: entitiesPlaceholder,
  } = entitiesQuery;
  const { isError: entitiesError, error: entitiesLoadError } = entitiesQuery;

  const [filters, setFilters] = useState<CollectFilters>(EMPTY_COLLECT_FILTERS);

  const queueCorePending = filters.hiddenOnly
    ? listPending(hiddenEvidenceQuery) || listPending(entitiesQuery)
    : listPending(evidenceQuery) ||
      listPending(jobsQuery) ||
      listPending(entitiesQuery);
  const queuePending = queueCorePending;
  const queuePlaceholder = filters.hiddenOnly
    ? hiddenEvidencePlaceholder
    : evidencePlaceholder ||
      jobsPlaceholder ||
      entitiesPlaceholder ||
      credentialsPlaceholder;
  const queueLoadError =
    !queuePending &&
    (filters.hiddenOnly
      ? hiddenEvidenceError || entitiesError
      : evidenceError || jobsError || entitiesError)
      ? errMessage(
          evidenceLoadError ??
            hiddenEvidenceLoadError ??
            jobsLoadError ??
            entitiesLoadError ??
            null,
          "Failed to load collect queue"
        )
      : null;

  const evidence = filters.hiddenOnly ? hiddenEvidenceRows : evidenceRows;
  const jobs = useMemo(() => sortJobQueue(jobsRaw), [jobsRaw]);
  const configuredCredentials = useMemo(() => {
    const names = new Set<string>();
    for (const slot of credentialSlots) {
      if (slot.configured) names.add(slot.name);
    }
    return names;
  }, [credentialSlots]);
  const credentialsLoadErrorMessage = credentialsError
    ? errMessage(credentialsLoadError, "Failed to load credentials")
    : null;
  const credentialsPending = listPending(credentialsQuery);
  const urlDumps = useMemo((): CollectUrlDump[] => {
    const dumps: CollectUrlDump[] = [];
    for (const row of evidenceRows) {
      const sourceUrl = row.sourceUrl?.trim();
      if (sourceUrl === undefined || sourceUrl === "") continue;
      dumps.push({ id: row.id, sourceUrl, label: row.label });
    }
    return dumps;
  }, [evidenceRows]);
  const evidenceTitleById = useMemo(
    () =>
      evidenceTitleMapForJobRecords(
        [...evidenceRows, ...hiddenEvidenceRows],
        jobsRaw.map((job) => job.input)
      ),
    [evidenceRows, hiddenEvidenceRows, jobsRaw]
  );

  return {
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
    credentialsLoadError: credentialsLoadErrorMessage,
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
  };
}
