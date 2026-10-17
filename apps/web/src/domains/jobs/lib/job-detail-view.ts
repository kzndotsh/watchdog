import {
  CANCELABLE,
  formatDuration,
  isLive,
  isTerminal,
  jobActivityAt,
  normalizedPlaybookRunId,
  playbookWaitingOnNextStep,
} from "@/domains/jobs/lib/status";
import { capabilityLabel } from "@/shared/ui/vocab";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
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
  canCancelPlaybook: boolean;
  proposalId: string | null;
  shouldShowFooter: boolean;
  capSummary: string;
  shouldShowAllKnownOutcome: boolean;
  ranInstant: string;
  shouldShowSucceededOutcomeChip: boolean;
};

/** Playbook spine hint for the current step (blocked / waiting on next). */
export function playbookBlockedWaitingMessage(opts: {
  job: Pick<JobRecord, "status" | "playbookStep" | "error">;
  playbookSteps: readonly JobListRecord[];
  recipeTotal?: number;
  playbookRunStatus?: PlaybookRunStatus | null;
}): string | null {
  if (opts.playbookSteps.length === 0) return null;

  const { job } = opts;
  if (job.status === "blocked") {
    const err = job.error?.trim();
    if (err) return err;
    const step = job.playbookStep ?? 0;
    if (step <= 0) {
      return "Blocked — waiting on credentials or setup.";
    }
    const prev = opts.playbookSteps.find((s) => s.playbookStep === step - 1);
    if (prev?.capabilityId) {
      return `Blocked — waiting for ${capabilityLabel(prev.capabilityId)} to finish.`;
    }
    return "Blocked — waiting for the previous playbook step.";
  }

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
  const canRetry = isTerminal(job.status);
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
    canCancelPlaybook,
    proposalId,
    shouldShowFooter:
      proposalId !== null || canCancel || canRetry || canCancelPlaybook,
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
