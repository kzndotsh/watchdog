import { queryOptions } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";

import { jobsKeys } from "@/domains/jobs/jobs-keys";
import {
  getJobFn,
  listCapabilitiesFn,
  listJobsFn,
  listPlaybooksFn,
} from "@/domains/jobs/jobs.functions";
import {
  parseGetJobInput,
  parseListJobsInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeJobDetail,
  scopeJobDetailEnabled,
} from "@/shared/lib/query-ingress";
import { invalidateAfterJobMutation } from "@/shared/lib/query-invalidation";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import {
  GC_REALTIME,
  GC_STABLE,
  STALE_REALTIME,
  STALE_STABLE,
} from "@/shared/lib/query-stale";

export { jobsKeys } from "@/domains/jobs/jobs-keys";

const capabilitiesKeys = {
  all: ["capabilities"] as const,
};

const playbooksKeys = {
  all: ["playbooks"] as const,
};

export const jobsListQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = jobsKeys.all(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () => listJobsFn({ data: parseListJobsInput(scopedCaseId) }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const jobDetailQuery = (caseId: string, jobId: string) => {
  const scoped = scopeJobDetail(caseId, jobId);
  const queryKey = jobsKeys.detail(scoped.caseId, scoped.jobId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getJobFn({ data: parseGetJobInput(scoped.caseId, scoped.jobId) }),
    enabled: scopeJobDetailEnabled(caseId, jobId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const capabilitiesListQuery = () => {
  const queryKey = capabilitiesKeys.all;
  return queryOptions({
    queryKey,
    queryFn: async () => listCapabilitiesFn(),
    staleTime: STALE_STABLE,
    gcTime: GC_STABLE,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const playbooksListQuery = () => {
  const queryKey = playbooksKeys.all;
  return queryOptions({
    queryKey,
    queryFn: async () => listPlaybooksFn(),
    staleTime: STALE_STABLE,
    gcTime: GC_STABLE,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** Jobs workspace freshness — SSE `job_update` is the follow-up path; no timed retries. */
export async function refreshJobsAfterMutation(
  queryClient: QueryClient,
  caseId: string
): Promise<void> {
  await invalidateAfterJobMutation(queryClient, caseId);
}
