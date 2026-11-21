import { queryOptions } from "@tanstack/react-query";

import { jobsKeys, RECENT_JOBS_LIMIT } from "@/domains/jobs/jobs-keys";
import { orpc } from "@/lib/orpc-client";
import {
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

/**
 * The Case's newest Jobs, one page (`jobs.listForCase`, `RECENT_JOBS_LIMIT` rows): what the Case
 * overview's Recent activity groups. Under `jobsKeys.all`, so every Job mutation and live update
 * of the Case refreshes it.
 */
export const jobsRecentQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = jobsKeys.recent(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () => {
      const page = await orpc.jobs.listForCase.call({
        caseId: scopedCaseId,
        limit: RECENT_JOBS_LIMIT,
      });
      return page.items;
    },
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
      orpc.jobs.get.call({ caseId: scoped.caseId, jobId: scoped.jobId }),
    enabled: scopeJobDetailEnabled(caseId, jobId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** Every typed value the Job's report holds, with who already holds each (`jobs.listFound`). */
export const jobFoundValuesQuery = (caseId: string, jobId: string) => {
  const scoped = scopeJobDetail(caseId, jobId);
  const queryKey = jobsKeys.found(scoped.caseId, scoped.jobId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      orpc.jobs.listFound.call({ caseId: scoped.caseId, jobId: scoped.jobId }),
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
      orpc.jobs.listProviderCalls.call({
        caseId: scoped.caseId,
        jobId: scoped.jobId,
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
      orpc.jobs.getPlaybookRun.call({
        caseId: scoped.caseId,
        playbookRunId: scoped.playbookRunId,
      }),
    enabled: scopePlaybookRunEnabled(caseId, playbookRunId),
    staleTime: STALE_REALTIME,
    gcTime: GC_REALTIME,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** The Cap catalog (`capabilities.list`): the instance's registry, not a Case's. */
export const capabilitiesListQuery = () => {
  const queryKey = orpc.capabilities.list.key({ type: "query" });
  return queryOptions({
    queryKey,
    queryFn: async () => orpc.capabilities.list.call(),
    staleTime: STALE_STABLE,
    gcTime: GC_STABLE,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** The Playbook catalog (`capabilities.listPlaybooks`). */
export const playbooksListQuery = () => {
  const queryKey = orpc.capabilities.listPlaybooks.key({ type: "query" });
  return queryOptions({
    queryKey,
    queryFn: async () => orpc.capabilities.listPlaybooks.call(),
    staleTime: STALE_STABLE,
    gcTime: GC_STABLE,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
