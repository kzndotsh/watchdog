import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import type { JobListRecord, JobRecord } from "@/domains/jobs/jobs.functions";
import {
  cancelJobFn,
  cancelPlaybookFn,
  startJobFn,
  startPlaybookFn,
} from "@/domains/jobs/jobs.functions";
import { buildCapRunInput } from "@/domains/jobs/lib/cap-run-input";
import {
  jobDetailQuery,
  jobsKeys,
  refreshJobsAfterMutation,
} from "@/domains/jobs/queries";
import type { CapListItem } from "@/domains/jobs/types";
import { errMessage } from "@/lib/utils";
import { useLiveEvents } from "@/shared/hooks/use-live-events";
import { listPending } from "@/shared/lib/list-pending";
import { resolveQueueSelection } from "@/shared/lib/queue-selection";

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
  jobId?: string;
  onJobIdChange: (next: string | null) => void;
  caps: CapListItem[];
  jobs: JobListRecord[];
  queue: JobListRecord[];
  /** True while the jobs list query is refetching (hold URL id not yet in queue). */
  jobsListFetching?: boolean;
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
  }: UseJobsWorkspaceOptions
) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const selectedId = resolveQueueSelection(jobId, queue, {
    // Keep URL while list refetch catches up, or when the job exists but is
    // filtered out of the visible queue (avoids Navigate remount on run).
    holdMissingUrlId:
      jobsListFetching ||
      (jobId !== undefined && jobs.some((j) => j.id === jobId)),
  });
  const selectedListRow = useMemo(
    () => queue.find((j) => j.id === selectedId) ?? null,
    [queue, selectedId]
  );
  const detailEnabled = Boolean(selectedId);
  const {
    data: selectedDetail,
    isFetched,
    isLoading,
    isError,
  } = useQuery({
    ...jobDetailQuery(caseId, selectedId ?? ""),
    enabled: detailEnabled,
  });
  const detailJob =
    selectedId !== null && selectedDetail?.id === selectedId
      ? selectedDetail
      : null;
  const detailPending = listPending(
    { isFetched, isError, isLoading },
    { enabled: detailEnabled }
  );

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
        const started = Date.parse(j.startedAt ?? j.createdAt);
        if (Number.isNaN(started)) return false;
        return now - started >= STUCK_JOB_MS;
      }),
    [jobs, now]
  );

  useLiveEvents(caseId, (event) => {
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
      const selectedCap = caps.find((c) => c.id === vars.capabilityId);
      return startJobFn({
        data: {
          caseId,
          capabilityId: vars.capabilityId,
          input: buildCapRunInput(
            selectedCap?.inputForm,
            vars.runInput,
            vars.entityId
          ),
        },
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
    }) =>
      startPlaybookFn({
        data: {
          caseId,
          playbookId: vars.playbookId,
          seed: {
            ...(vars.host.trim() ? { host: vars.host.trim() } : {}),
            ...(vars.url.trim() ? { url: vars.url.trim() } : {}),
            ...(vars.evidenceId.trim()
              ? { evidenceId: vars.evidenceId.trim() }
              : {}),
            ...(vars.entityId.trim() ? { entityId: vars.entityId.trim() } : {}),
            ...(vars.ip.trim() ? { ip: vars.ip.trim() } : {}),
            ...(vars.email.trim() ? { email: vars.email.trim() } : {}),
            ...(vars.hash.trim() ? { hash: vars.hash.trim() } : {}),
            ...(vars.handle.trim() ? { handle: vars.handle.trim() } : {}),
          },
        },
      }),
    onSuccess: async (result) => {
      cacheStartedJobs(queryClient, caseId, result.jobs);
      onJobIdChange(result.jobs[0]?.id ?? null);
      await refreshJobsAfterMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Couldn't start playbook"));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (selectedId === null) throw new Error("Nothing to cancel");
      return cancelJobFn({ data: { caseId, jobId: selectedId } });
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
      const runId = selectedListRow?.playbookRunId;
      if (!runId) throw new Error("Not part of a playbook run");
      return cancelPlaybookFn({
        data: { caseId, playbookRunId: runId },
      });
    },
    onSuccess: async () => {
      await refreshJobsAfterMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, "Couldn't cancel playbook"));
    },
  });

  const playbookRunId = selectedListRow?.playbookRunId;
  const hasPlaybookRun = Boolean(playbookRunId);
  const runSiblings = hasPlaybookRun
    ? jobs.filter((j) => j.playbookRunId === playbookRunId)
    : [];

  return {
    selectedId,
    selectedListRow,
    detailJob,
    detailPending,
    stuckJobs,
    error,
    setError,
    selectionOutOfSync: (jobId ?? null) !== selectedId,
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
