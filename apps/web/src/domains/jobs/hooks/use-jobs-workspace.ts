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
  retryJobFn,
  startJobFn,
  startPlaybookFn,
} from "@/domains/jobs/jobs.functions";
import { attemptChain } from "@/domains/jobs/lib/attempts";
import { buildCapRunInput } from "@/domains/jobs/lib/cap-run-input";
import {
  jobActivityAt,
  normalizedPlaybookRunId,
} from "@/domains/jobs/lib/status";
import {
  jobDetailQuery,
  jobsKeys,
  playbookRunQuery,
} from "@/domains/jobs/queries";
import type { CapListItem } from "@/domains/jobs/types";
import { couldnt, errMessage } from "@/lib/utils";
import { listPending } from "@/shared/lib/list-pending";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { invalidateAfterJobMutation } from "@/shared/lib/query-invalidation";
import { queryLoadError } from "@/shared/lib/query-load-error";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import { playbookSeedInputSchema } from "@watchdog/schemas/caps";
import {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  retryJobInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
} from "@watchdog/schemas/jobs";
import { isLiveJobStatus, trimmedOrUndefined } from "@watchdog/schemas/shared";

const STUCK_JOB_MS = 60_000;

/** Seed each started Job's detail so the selection shows it before the queue refresh lands. */
function cacheStartedJobs(
  queryClient: QueryClient,
  caseId: string,
  started: readonly JobRecord[]
): void {
  for (const job of started) {
    queryClient.setQueryData(jobsKeys.detail(caseId, job.id), job);
  }
}

export type UseJobsWorkspaceOptions = {
  /** The Job whose detail shows; `null` = none (an Evidence row has no Job detail). */
  jobId?: string | null;
  onJobIdChange: (next: string | null) => void;
  caps: CapListItem[];
  /** The selected queue row's Jobs: the run's steps and the selected Job's attempts. */
  rowJobs: readonly JobListRecord[];
  /** The Jobs on the loaded pages, for the "worker may be down" check. */
  liveJobs: readonly JobListRecord[];
};

export function useJobsWorkspace(
  caseId: string,
  { jobId, onJobIdChange, caps, rowJobs, liveJobs }: UseJobsWorkspaceOptions
) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const selectedId = scopeOptionalUuid(jobId) ?? null;
  const selectedListRow = useMemo(
    () => rowJobs.find((j) => j.id === selectedId) ?? null,
    [rowJobs, selectedId]
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
    { isEnabled: detailQueryEnabled }
  );
  const detailLoadError =
    selectedId === null
      ? null
      : queryLoadError(
          {
            isError,
            isFetching: detailFetching,
            error: detailQueryError,
          },
          detailPending,
          "Failed to load job detail"
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
      liveJobs.filter((j) => {
        if (!isLiveJobStatus(j.status)) return false;
        const anchor =
          j.status === "running" && j.startedAt !== null && j.startedAt !== ""
            ? j.startedAt
            : jobActivityAt(j);
        const started = Date.parse(anchor);
        if (Number.isNaN(started)) return false;
        return now - started >= STUCK_JOB_MS;
      }),
    [liveJobs, now]
  );

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
      await invalidateAfterJobMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("start", "job")));
    },
  });

  const retryMutation = useMutation({
    mutationFn: async () => {
      if (selectedId === null) throw new Error("Nothing to retry");
      return retryJobFn({
        data: retryJobInputSchema.parse({ caseId, jobId: selectedId }),
      });
    },
    onSuccess: async (job) => {
      cacheStartedJobs(queryClient, caseId, [job]);
      onJobIdChange(job.id);
      await invalidateAfterJobMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("retry", "job")));
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
      await invalidateAfterJobMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("start", "playbook")));
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
      await invalidateAfterJobMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("cancel", "job")));
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
      await invalidateAfterJobMutation(queryClient, caseId);
    },
    onError: (e) => {
      setError(errMessage(e, couldnt("cancel", "playbook")));
    },
  });

  const playbookRunId = normalizedPlaybookRunId(selectedListRow?.playbookRunId);
  const hasPlaybookRun = playbookRunId !== null;
  // Each step's outcome (skipped steps included) comes from the run, not from the Jobs list: a
  // skipped step has no Job. It sits under `jobsKeys.all`, so every Job mutation and SSE Job
  // entry refreshes it, including a retry that resumes a finished run.
  const playbookRunOptions = playbookRunQuery(caseId, playbookRunId ?? "");
  const { data: playbookRunData } = useQuery({
    ...playbookRunOptions,
    enabled: hasPlaybookRun && queryEnabledFlag(playbookRunOptions.enabled),
  });
  const playbookRun =
    hasPlaybookRun && playbookRunData?.id === playbookRunId
      ? playbookRunData
      : null;
  const runSiblings = hasPlaybookRun
    ? rowJobs.filter(
        (j) => normalizedPlaybookRunId(j.playbookRunId) === playbookRunId
      )
    : [];

  const attempts = useMemo(
    () => (selectedId === null ? [] : attemptChain(rowJobs, selectedId)),
    [rowJobs, selectedId]
  );

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
    hasPlaybookRun,
    playbookRun,
    runSiblings,
    attempts,
    retryBusy: retryMutation.isPending,
    handleRetry: () => {
      setError(null);
      retryMutation.mutate();
    },
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
