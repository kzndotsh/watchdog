import {
  buildRunStepRows,
  runOutcomeDisplay,
  runStepTally,
} from "@/domains/jobs/lib/playbook-run-view";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/ui/primitives/button";
import { SectionLabel } from "@/shared/ui/section-label";
import { TimelineDot } from "@/shared/ui/timeline-dot";
import { TimelineSpine } from "@/shared/ui/timeline-spine";
import {
  StatusInk,
  capabilityLabel,
  playbookLabel,
  statusLabel,
} from "@/shared/ui/vocab";
import { STATUS_DOT } from "@/shared/ui/vocab/status.lib";
import type { JobListRecord } from "@watchdog/core/jobs";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";

type JobPlaybookSpineProps = {
  playbookId: string;
  /** The run's Jobs: the spine until the run's own view has loaded. */
  steps: JobListRecord[];
  /** Each recipe step's outcome, skipped steps included; null until it loads. */
  run: PlaybookRunView | null;
  currentStep: number;
  waitingNote: string | null;
  /** Select the Job of a step (to read its log or retry it). */
  onSelectStep?: (jobId: string) => void;
};

function JobStepSpine({
  steps,
  currentStep,
  waitingNote,
}: Pick<JobPlaybookSpineProps, "steps" | "currentStep" | "waitingNote">) {
  return (
    <TimelineSpine className="ml-2 pl-4">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const isCurrent = step.playbookStep === currentStep;
        return (
          <div key={step.id} className={cn("relative", !isLast && "pb-3")}>
            <TimelineDot className={STATUS_DOT[step.status]} />
            <p className="text-xs">
              {i + 1} · {capabilityLabel(step.capabilityId)}{" "}
              <span className="text-muted-foreground font-normal">
                {statusLabel(step.status)}
              </span>
            </p>
            {isCurrent && waitingNote !== null ? (
              <p className="text-muted-foreground text-xs">{waitingNote}</p>
            ) : null}
          </div>
        );
      })}
    </TimelineSpine>
  );
}

function RunStepSpine({
  run,
  currentStep,
  waitingNote,
  onSelectStep,
}: Pick<
  JobPlaybookSpineProps,
  "currentStep" | "waitingNote" | "onSelectStep"
> & {
  run: PlaybookRunView;
}) {
  const rows = buildRunStepRows(run);
  return (
    <TimelineSpine className="ml-2 pl-4">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const isCurrent = row.step === currentStep;
        const jobId = row.jobId;
        return (
          <div
            key={row.key}
            className={cn("relative", !isLast && "pb-3")}
            aria-current={isCurrent ? "step" : undefined}
          >
            <TimelineDot className={STATUS_DOT[row.outcome.status]} />
            <p className="text-xs">
              {row.step + 1} ·{" "}
              {jobId === null || onSelectStep === undefined || isCurrent ? (
                row.capability
              ) : (
                <Button
                  type="button"
                  variant="link"
                  size="inline"
                  onClick={() => {
                    onSelectStep(jobId);
                  }}
                >
                  {row.capability}
                </Button>
              )}{" "}
              <span className="text-muted-foreground font-normal">
                {row.outcome.label}
              </span>
            </p>
            {row.reason === null ? null : (
              <p className="text-muted-foreground text-xs">{row.reason}</p>
            )}
            {isCurrent && waitingNote !== null ? (
              <p className="text-muted-foreground text-xs">{waitingNote}</p>
            ) : null}
          </div>
        );
      })}
    </TimelineSpine>
  );
}

/**
 * The Playbook's steps as a spine. With the run's own view each recipe step shows its outcome
 * (succeeded, failed, running, pending, or skipped with the reason) and the run's outcome
 * heads it; without it (still loading, or the read failed) the run's Jobs stand in.
 */
export function JobPlaybookSpine({
  playbookId,
  steps,
  run,
  currentStep,
  waitingNote,
  onSelectStep,
}: JobPlaybookSpineProps) {
  if (run === null && steps.length === 0) return null;

  const outcome = run === null ? null : runOutcomeDisplay(run);
  const tally = run === null ? "" : runStepTally(run);

  return (
    <div>
      <SectionLabel as="span" density="compact">
        Playbook · {playbookLabel(playbookId)}
      </SectionLabel>
      {outcome === null ? null : (
        <p className="mt-1 flex items-center gap-1.5 text-xs">
          <span className="text-muted-foreground">Run</span>
          <StatusInk status={outcome.status}>{outcome.label}</StatusInk>
          {tally === "" ? null : (
            <span className="text-muted-foreground">· {tally}</span>
          )}
        </p>
      )}
      <div className="mt-2">
        {run === null ? (
          <JobStepSpine
            steps={steps}
            currentStep={currentStep}
            waitingNote={waitingNote}
          />
        ) : (
          <RunStepSpine
            run={run}
            currentStep={currentStep}
            waitingNote={waitingNote}
            onSelectStep={onSelectStep}
          />
        )}
      </div>
    </div>
  );
}
