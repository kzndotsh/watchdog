import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  buildCaseOverviewActivity,
  CASE_OVERVIEW_ACTIVITY_LIMIT,
  type ActivityItem,
} from "@/domains/cases/lib/overview-activity";
import { caseCountsQuery } from "@/domains/cases/queries";
import { entityPickerPort } from "@/domains/entities/queries";
import {
  evidencePickerPort,
  recentEvidenceQuery,
} from "@/domains/intake/queries";
import { jobsRecentQuery } from "@/domains/jobs/queries";
import { pendingProposalsQuery } from "@/domains/triage/queries";
import { useRecordsByIds } from "@/shared/hooks/use-picker-source";
import { listPending } from "@/shared/lib/list-pending";
import { combinedQueryLoadError } from "@/shared/lib/query-load-error";
import { anyQueryPlaceholderData } from "@/shared/lib/query-placeholder";
import type { JobListRecord } from "@watchdog/core/jobs";
import type { ProposalQueueItem } from "@watchdog/core/proposals";
import {
  entityIdsFromJobInputs,
  entityTitleMapForJobInputs,
  evidenceIdsFromJobInputs,
} from "@watchdog/schemas/jobs";

const NO_JOBS: JobListRecord[] = [];
const NO_PROPOSALS: ProposalQueueItem[] = [];

/**
 * What the Case overview reads (#571): the tile counts in one request, and one page each of the
 * Case's newest Evidence, newest Jobs and pending Proposals for Recent activity. The Entities and
 * Evidence that Job inputs name are read by id, never as a whole list.
 */
export function useCaseOverviewData(caseId: string) {
  const results = useQueries({
    queries: [
      caseCountsQuery(caseId),
      recentEvidenceQuery(caseId),
      jobsRecentQuery(caseId),
      pendingProposalsQuery(caseId),
    ] as const,
  });
  const [countsQuery, evidenceQuery, jobsQuery, pendingQuery] = results;
  const jobs = jobsQuery.data ?? NO_JOBS;
  const evidence = evidenceQuery.data;
  const pendingProposals = pendingQuery.data?.items ?? NO_PROPOSALS;

  const inputs = useMemo(() => jobs.map((job) => job.input), [jobs]);
  const entityIds = useMemo(() => entityIdsFromJobInputs(inputs), [inputs]);
  const evidenceIds = useMemo(() => evidenceIdsFromJobInputs(inputs), [inputs]);
  const entitiesById = useRecordsByIds(entityPickerPort(caseId), entityIds);
  const evidenceById = useRecordsByIds(evidencePickerPort(caseId), evidenceIds);

  const activity: ActivityItem[] = useMemo(() => {
    const entityLabels = Object.fromEntries(
      entityTitleMapForJobInputs([...entitiesById.values()], inputs)
    );
    return buildCaseOverviewActivity(
      evidence ?? [],
      jobs,
      pendingProposals,
      CASE_OVERVIEW_ACTIVITY_LIMIT,
      [...evidenceById.values()],
      entityLabels
    );
  }, [evidence, jobs, pendingProposals, inputs, entitiesById, evidenceById]);

  const isPending = results.some((query) => listPending(query));
  return {
    counts: countsQuery.data,
    pendingProposalCount: pendingQuery.data?.count ?? 0,
    pendingProposalLabel: pendingQuery.data?.countLabel ?? 0,
    activity,
    isPending,
    isPlaceholder: anyQueryPlaceholderData(results),
    loadError: combinedQueryLoadError(
      results,
      isPending,
      "Failed to load case overview"
    ),
    retry: () => {
      for (const query of results) {
        if (query.isError) void query.refetch();
      }
    },
  };
}
