import {
  CANCELABLE,
  formatDuration,
  isLive,
  isTerminal,
  jobActivityAt,
  normalizedPlaybookRunId,
  playbookWaitingOnNextStep,
} from "@/domains/jobs/lib/status";
import { caseExportDownloadPath } from "@/shared/lib/api-urls";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import { CASE_EXPORT_JOB_ID } from "@watchdog/schemas/caps";
import { summarizeJobInput } from "@watchdog/schemas/jobs";
import {
  trimmedOrNull,
  type PlaybookRunStatus,
} from "@watchdog/schemas/shared";

export type JobDetailTab = "log" | "input" | "output";

export type JobDetailView = {
  isLive: boolean;
  logs: string;
  duration: string | null;
  inputHint: string;
  outputCount: number;
  hasInterpretFailed: boolean;
  canCancel: boolean;
  canRetry: boolean;
  /** The expiring download link of a finished Case export Job; null for any other Job. */
  exportDownloadPath: string | null;
  canCancelPlaybook: boolean;
  proposalId: string | null;
  shouldShowFooter: boolean;
  capSummary: string;
  shouldShowAllKnownOutcome: boolean;
  ranInstant: string;
  shouldShowSucceededOutcomeChip: boolean;
};

/** Playbook spine hint for the current step (waiting on the next step). */
export function playbookWaitingMessage(opts: {
  playbookSteps: readonly JobListRecord[];
  recipeTotal?: number;
  playbookRunStatus?: PlaybookRunStatus | null;
}): string | null {
  if (opts.playbookSteps.length === 0) return null;

  if (
    playbookWaitingOnNextStep(
      opts.playbookSteps,
      opts.recipeTotal,
      opts.playbookRunStatus ?? null
    )
  ) {
    return "Waiting to queue the next playbook step.";
  }

  return null;
}

export function buildJobDetailView(input: {
  job: JobRecord;
  evidenceTitleById?: ReadonlyMap<string, string>;
  entityTitleById?: ReadonlyMap<string, string>;
  onCancelPlaybook?: () => void;
}): JobDetailView {
  const { job, evidenceTitleById, entityTitleById, onCancelPlaybook } = input;
  const interpretFailed = Boolean(job.interpretError);
  const canCancel = CANCELABLE.has(job.status);
  // An export Job is not a Cap: there is nothing to re-run from its input.
  const isExport = job.capabilityId === CASE_EXPORT_JOB_ID;
  const canRetry = isTerminal(job.status) && !isExport;
  const exportDownloadPath =
    isExport && job.status === "succeeded"
      ? caseExportDownloadPath(job.caseId, job.id)
      : null;
  const canCancelPlaybook =
    normalizedPlaybookRunId(job.playbookRunId) !== null &&
    onCancelPlaybook !== undefined;
  const proposalId = trimmedOrNull(job.proposalId);
  const duration = formatDuration(job.startedAt, job.finishedAt);

  return {
    isLive: isLive(job.status),
    logs: (job.logs ?? []).join("\n").trim(),
    duration,
    inputHint: summarizeJobInput(job.input, evidenceTitleById, entityTitleById),
    outputCount: job.output?.length ?? 0,
    hasInterpretFailed: interpretFailed,
    canCancel,
    canRetry,
    exportDownloadPath,
    canCancelPlaybook,
    proposalId,
    shouldShowFooter:
      proposalId !== null ||
      canCancel ||
      canRetry ||
      canCancelPlaybook ||
      exportDownloadPath !== null,
    capSummary:
      job.resultSummary !== null && job.resultSummary !== ""
        ? job.resultSummary
        : "",
    shouldShowAllKnownOutcome:
      job.status === "succeeded" &&
      !interpretFailed &&
      proposalId === null &&
      job.suppressedCount > 0,
    ranInstant:
      job.startedAt !== null && job.startedAt !== ""
        ? job.startedAt
        : jobActivityAt(job),
    shouldShowSucceededOutcomeChip:
      job.status === "succeeded" && !interpretFailed && proposalId === null,
  };
}
