import { ChevronDownIcon } from "lucide-react";

import { processRunCardDomId } from "@/domains/intake/lib/process-run-card-dom";
import { ArtifactContent } from "@/domains/jobs/components/artifact-content";
import {
  artifactDefaultOpen,
  orderJobArtifacts,
} from "@/domains/jobs/lib/artifacts";
import { jobActivityAt } from "@/domains/jobs/lib/status";
import type { JobListRecord } from "@/domains/jobs/types";
import { cn } from "@/lib/utils";
import { IdChip } from "@/shared/ui/id-chip";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { StatusInk, jobHeadlineLabel } from "@/shared/ui/vocab";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@watchdog/ui/components/collapsible";
import { FieldError } from "@watchdog/ui/components/field";

function processRunIsLive(job: JobListRecord): boolean {
  return job.status === "queued" || job.status === "running";
}

function processRunEmptyArtifactsMessage(
  job: JobListRecord,
  live: boolean
): string {
  if (live) {
    return "Still running — output appears when the job finishes.";
  }
  if (job.status === "blocked") {
    if (job.error?.trim()) {
      return "No artifacts from this run.";
    }
    return "Blocked — waiting on credentials or a prior step.";
  }
  return "No artifacts from this run.";
}

export function ProcessRunCard({
  job,
  defaultOpen = false,
  open,
  onOpenChange,
  highlighted = false,
}: {
  job: JobListRecord;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  highlighted?: boolean;
}) {
  const live = processRunIsLive(job);
  const controlled = open !== undefined;

  return (
    <div
      id={processRunCardDomId(job.id)}
      className={cn(
        "border-border scroll-mt-2 overflow-hidden rounded-md border",
        highlighted && "ring-ring/40 ring-2"
      )}
    >
      <Collapsible
        open={controlled ? open : undefined}
        defaultOpen={controlled ? undefined : defaultOpen}
        onOpenChange={onOpenChange}
      >
        <CollapsibleTrigger
          nativeButton={false}
          render={<div />}
          className="group/run-trigger hover:bg-muted/40 focus-visible:ring-ring/50 flex w-full items-start gap-2 px-3 py-2.5 text-left outline-none focus-visible:ring-2"
        >
          <ChevronDownIcon
            className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-aria-expanded/run-trigger:rotate-180"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-foreground text-xs font-medium">
                {jobHeadlineLabel(job)}
              </p>
              <div className="flex items-center gap-1.5">
                <StatusInk status={job.status} pulse={live} />
                {live ? (
                  <span className="text-muted-foreground">live</span>
                ) : null}
              </div>
            </div>
            <p className="text-2xs text-muted-foreground mt-1.5 font-mono tabular-nums">
              <LocalDateTime value={jobActivityAt(job)} />
              {job.output && job.output.length > 0 ? (
                <>
                  <span aria-hidden> · </span>
                  {job.output.length} artifact
                  {job.output.length === 1 ? "" : "s"}
                </>
              ) : null}
            </p>
          </div>
          {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- keep IdChip copy from toggling the run card */}
          <span
            className="shrink-0"
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
          >
            <IdChip value={job.id} copyable />
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-border space-y-3 border-t px-3 py-3">
            {job.resultSummary !== null && job.resultSummary !== "" ? (
              <div className="bg-muted/30 rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs font-medium">
                  Summary
                </p>
                <p className="mt-0.5 text-sm leading-relaxed">
                  {job.resultSummary}
                </p>
              </div>
            ) : null}

            <FieldError>{job.error}</FieldError>

            {job.output && job.output.length > 0 ? (
              <div className="flex flex-col gap-2">
                {orderJobArtifacts(job.output).map((art, i) => (
                  <ArtifactContent
                    key={`${art.sha256}-${art.name}`}
                    caseId={job.caseId}
                    jobId={job.id}
                    sha256={art.sha256}
                    mime={art.mime}
                    name={art.name}
                    defaultOpen={artifactDefaultOpen(art.name, i)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">
                {processRunEmptyArtifactsMessage(job, live)}
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
