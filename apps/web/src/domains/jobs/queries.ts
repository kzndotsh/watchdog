import { queryOptions } from "@tanstack/react-query";

import { jobsKeys } from "@/domains/jobs/jobs-keys";
import {
  getJobFn,
  getPlaybookRunFn,
  listCapabilitiesFn,
  listJobProviderCallsFn,
  listPlaybooksFn,
  listRecentJobsFn,
} from "@/domains/jobs/jobs.functions";
import {
  parseGetJobInput,
  parsePlaybookRunInput,
  parseListJobsInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeJobDetail,
  scopeJobDetailEnabled,
  scopePlaybookRun,
  scopePlaybookRunEnabled,
} from "@/shared/lib/query-ingress";
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

/**
 * The Case's newest Jobs, one page: what the Case overview's Recent activity groups. Under
 * `jobsKeys.all`, so every Job mutation and live update of the Case refreshes it.
 */
export const jobsRecentQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = jobsKeys.recent(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listRecentJobsFn({ data: parseListJobsInput(scopedCaseId) }),
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

export const jobProviderCallsQuery = (caseId: string, jobId: string) => {
  const scoped = scopeJobDetail(caseId, jobId);
  const queryKey = jobsKeys.providerCalls(scoped.caseId, scoped.jobId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listJobProviderCallsFn({
        data: parseGetJobInput(scoped.caseId, scoped.jobId),
      }),
    enabled: scopeJobDetailEnabled(caseId, jobId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const playbookRunQuery = (caseId: string, playbookRunId: string) => {
  const scoped = scopePlaybookRun(caseId, playbookRunId);
  const queryKey = jobsKeys.playbookRun(scoped.caseId, scoped.playbookRunId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getPlaybookRunFn({
        data: parsePlaybookRunInput(scoped.caseId, scoped.playbookRunId),
      }),
    enabled: scopePlaybookRunEnabled(caseId, playbookRunId),
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
