import { ChevronDownIcon } from "lucide-react";

import { processRunCardDomId } from "@/domains/intake/lib/process-run-card-dom";
import { ArtifactContent } from "@/domains/jobs/components/artifact-content";
import type { JobListRecord } from "@/domains/jobs/jobs.functions";
import {
  artifactDefaultOpen,
  orderJobArtifacts,
} from "@/domains/jobs/lib/artifacts";
import { cn } from "@/lib/utils";
import { DetailStatusChip } from "@/shared/ui/detail-status-chip";
import { FormInlineError } from "@/shared/ui/form-inline-message";
import { IdChip } from "@/shared/ui/id-chip";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/ui/shadcn/collapsible";
import { StatusBadge, capabilityLabel } from "@/shared/ui/vocab";

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
  const live = job.status === "queued" || job.status === "running";
  const controlled = open !== undefined;

  return (
    <Collapsible
      id={processRunCardDomId(job.id)}
      open={controlled ? open : undefined}
      defaultOpen={controlled ? undefined : defaultOpen}
      onOpenChange={onOpenChange}
      className={cn(
        "border-border scroll-mt-2 overflow-hidden rounded-md border",
        highlighted && "ring-ring/40 ring-2"
      )}
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
              {capabilityLabel(job.capabilityId)}
            </p>
            <div className="flex items-center gap-1.5">
              <StatusBadge status={job.status} size="md" />
              {live ? <DetailStatusChip>live</DetailStatusChip> : null}
            </div>
          </div>
          <p className="text-label-mono-sm text-muted-foreground mt-1.5 tabular-nums">
            <LocalDateTime value={job.createdAt} />
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

      <CollapsibleContent className="border-border space-y-3 border-t px-3 py-3">
        {job.resultSummary !== null && job.resultSummary !== "" ? (
          <div className="bg-muted/30 rounded-md border px-3 py-2">
            <p className="text-muted-foreground text-xs font-medium">Summary</p>
            <p className="mt-0.5 text-sm leading-relaxed">
              {job.resultSummary}
            </p>
          </div>
        ) : null}

        <FormInlineError>{job.error}</FormInlineError>

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
            {live
              ? "Still running — output appears when the job finishes."
              : "No artifacts from this run."}
          </p>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
