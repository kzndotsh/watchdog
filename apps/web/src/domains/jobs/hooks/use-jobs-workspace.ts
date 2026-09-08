import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  cancelJobFn,
  cancelPlaybookFn,
  startJobFn,
  startPlaybookFn,
} from "@/domains/jobs/jobs.functions";
import { buildCapRunInput } from "@/domains/jobs/lib/cap-run-input";
import {
  jobActivityAt,
  normalizedPlaybookRunId,
} from "@/domains/jobs/lib/status";
import {
  jobDetailQuery,
  jobsKeys,
  refreshJobsAfterMutation,
} from "@/domains/jobs/queries";
import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
  type JobListRecord,
  type JobRecord,
  type CapListItem,
} from "@/domains/jobs/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { resolveQueueSelection } from "@/shared/lib/queue-selection";
import {
  playbookSeedInputSchema,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

const STUCK_JOB_MS = 60_000;

function toListRow(job: JobRecord): JobListRecord {
  const { logs: _logs, ...row } = job;
  return row;
}

/** Seed list + detail so URL selection resolves before invalidate settles. */
function cacheStartedJobs(
  queryClient: QueryClient,
  caseId: string,
  started: readonly JobRecord[]
): void {
  if (started.length === 0) return;
  queryClient.setQueryData<JobListRecord[]>(jobsKeys.all(caseId), (old) => {
    const incoming = started.map(toListRow);
    if (!old) return incoming;
    const ids = new Set(incoming.map((j) => j.id));
    return [...incoming, ...old.filter((j) => !ids.has(j.id))];
  });
  for (const job of started) {
    queryClient.setQueryData(jobsKeys.detail(caseId, job.id), job);
  }
}

export interface UseJobsWorkspaceOptions {
  /** Job list row id to select; `null` = no selection (no first-row fallback). */
  jobId?: string | null;
  onJobIdChange: (next: string | null) => void;
  caps: CapListItem[];
  jobs: JobListRecord[];
  queue: JobListRecord[];
  /** True while the jobs list query is refetching (hold URL id not yet in queue). */
  jobsListFetching?: boolean;
  /** When false, skip SSE `job_update` — parent workspace owns invalidation. */
  live?: boolean;
}

export function useJobsWorkspace(
  caseId: string,
  {
    jobId,
    onJobIdChange,
    caps,
    jobs,
    queue,
    jobsListFetching = false,
    live = true,
  }: UseJobsWorkspaceOptions
) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const normalizedJobId = scopeOptionalUuid(jobId);

  const selectedId =
    jobId === null
      ? null
      : resolveQueueSelection(normalizedJobId, queue, {
          // Keep URL while list refetch catches up, or when the job exists but is
          // filtered out of the visible queue (avoids Navigate remount on run).
          holdMissingUrlId:
            jobsListFetching ||
            (normalizedJobId !== undefined &&
              jobs.some((j) => j.id === normalizedJobId)),
        });
  const selectedListRow = useMemo(
    () => queue.find((j) => j.id === selectedId) ?? null,
    [queue, selectedId]
  );
  const detailQueryOptions = jobDetailQuery(caseId, selectedId ?? "");
  const detailQueryEnabled =
    Boolean(selectedId) && queryEnabledFlag(detailQueryOptions.enabled);
  const {
    data: selectedDetail,
    isFetched,
    isLoading,
    isError,
    error: detailQueryError,
    refetch: refetchDetail,
    isFetching: detailFetching,
    isPlaceholderData: detailPlaceholder,
  } = useQuery({
    ...detailQueryOptions,
    enabled: detailQueryEnabled,
  });
  const detailJob =
    selectedId !== null && selectedDetail?.id === selectedId
      ? selectedDetail
      : null;
  const detailPending = listPending(
    { isFetched, isError, isLoading },
    { enabled: detailQueryEnabled }
  );
  const detailLoadError =
    selectedId !== null && !detailPending && !detailFetching && isError
      ? errMessage(detailQueryError, "Failed to load job detail")
      : null;

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 10_000);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  const stuckJobs = useMemo(
    () =>
      jobs.filter((j) => {
        if (j.status !== "queued" && j.status !== "running") return false;
        const anchor =
          j.status === "running" && j.startedAt !== null && j.startedAt !== ""
            ? j.startedAt
            : jobActivityAt(j);
        const started = Date.parse(anchor);
        if (Number.isNaN(started)) return false;
        return now - started >= STUCK_JOB_MS;
      }),
    [jobs, now]
  );

  useLiveEvents(live ? caseId : null, (event) => {
    if (event.type === "job_update") {
      void refreshJobsAfterMutation(queryClient, caseId);
    }
  });

  const startMutation = useMutation({
    mutationFn: async (vars: {
      capabilityId: string;
      runInput: string;
      entityId: string;
    }) => {
      const capabilityId = trimmedOrUndefined(vars.capabilityId);
      if (capabilityId === undefined) {
        throw new Error("Capability is required");
      }
      const selectedCap = caps.find((c) => c.id === capabilityId);
      return startJobFn({
        data: startJobInputSchema.parse({
          caseId,
          capabilityId,
          input: buildCapRunInput(
            selectedCap?.inputForm,
            vars.runInput,
            vars.entityId
          ),
        }),
      });
    },
    onSuccess: async (job) => {
      cacheStartedJobs(queryClient, caseId, [job]);
      onJobIdChange(job.id);
      await refreshJobsAfterMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Couldn't start job"));
    },
  });

  const startPlaybookMutation = useMutation({
    mutationFn: async (vars: {
      playbookId: string;
      host: string;
      url: string;
      evidenceId: string;
      entityId: string;
      ip: string;
      email: string;
      hash: string;
      handle: string;
    }) => {
      const playbookId = trimmedOrUndefined(vars.playbookId);
      if (playbookId === undefined) {
        throw new Error("Playbook is required");
      }
      return startPlaybookFn({
        data: startPlaybookInputSchema.parse({
          caseId,
          playbookId,
          seed: playbookSeedInputSchema.parse({
            host: vars.host,
            url: vars.url,
            evidenceId: vars.evidenceId,
            entityId: vars.entityId,
            ip: vars.ip,
            email: vars.email,
            hash: vars.hash,
            handle: vars.handle,
          }),
        }),
      });
    },
    onSuccess: async (result) => {
      cacheStartedJobs(queryClient, caseId, result.jobs);
      // Collect rows key playbook runs by run id; step job ids need focusRunId indirection.
      const runId = normalizedPlaybookRunId(result.playbookRunId);
      if (runId !== null) onJobIdChange(runId);
      await refreshJobsAfterMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Couldn't start playbook"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (selectedId === null) throw new Error("Nothing to cancel");
      return cancelJobFn({
        data: cancelJobInputSchema.parse({ caseId, jobId: selectedId }),
      });
    },
    onSuccess: async () => {
      await refreshJobsAfterMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Cancel failed"));
    },
  });

  const cancelPlaybookMutation = useMutation({
    mutationFn: async () => {
      const runId = normalizedPlaybookRunId(selectedListRow?.playbookRunId);
      if (runId === null) throw new Error("Not part of a playbook run");
      return cancelPlaybookFn({
        data: cancelPlaybookInputSchema.parse({
          caseId,
          playbookRunId: runId,
        }),
      });
    },
    onSuccess: async () => {
      await refreshJobsAfterMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Couldn't cancel playbook"));
    },
  });

  const playbookRunId = normalizedPlaybookRunId(selectedListRow?.playbookRunId);
  const hasPlaybookRun = playbookRunId !== null;
  const runSiblings = hasPlaybookRun
    ? jobs.filter(
        (j) => normalizedPlaybookRunId(j.playbookRunId) === playbookRunId
      )
    : [];

  return {
    selectedId,
    selectedListRow,
    detailJob,
    detailPending,
    detailLoadError,
    handleRetryDetail: () => {
      void refetchDetail();
    },
    detailPlaceholder,
    stuckJobs,
    error,
    setError,
    selectionOutOfSync: trimmedOrNull(jobId) !== selectedId,
    hasPlaybookRun,
    runSiblings,
    cancelBusy: cancelMutation.isPending,
    cancelPlaybookBusy: cancelPlaybookMutation.isPending,
    handleRunCap: async (vars: {
      capabilityId: string;
      runInput: string;
      entityId: string;
    }) => {
      setError(null);
      await startMutation.mutateAsync(vars);
    },
    handleRunPlaybook: async (vars: {
      playbookId: string;
      host: string;
      url: string;
      evidenceId: string;
      entityId: string;
      ip: string;
      email: string;
      hash: string;
      handle: string;
    }) => {
      setError(null);
      await startPlaybookMutation.mutateAsync(vars);
    },
    handleCancel: () => {
      setError(null);
      cancelMutation.mutate();
    },
    handleCancelPlaybook: () => {
      setError(null);
      cancelPlaybookMutation.mutate();
    },
  };
}
