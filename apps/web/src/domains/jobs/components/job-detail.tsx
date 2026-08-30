import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { ArtifactContent } from "@/domains/jobs/components/artifact-content";
import type { JobListRecord, JobRecord } from "@/domains/jobs/jobs.functions";
import {
  artifactDefaultOpen,
  orderJobArtifacts,
} from "@/domains/jobs/lib/artifacts";
import {
  buildJobDetailView,
  type JobDetailTab,
  type JobDetailView,
} from "@/domains/jobs/lib/job-detail-view";
import { playbookWaitingOnNextStep } from "@/domains/jobs/lib/status";
import { cn } from "@/lib/utils";
import { ActiveTabBody } from "@/shared/ui/active-tab-body";
import { CodeBlock } from "@/shared/ui/code-block";
import {
  DetailContextHeader,
  DetailContextSep,
} from "@/shared/ui/detail-context-strip";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import { DetailFooter } from "@/shared/ui/detail-footer";
import {
  DETAIL_CHIP_CLASS,
  DetailStatusChip,
} from "@/shared/ui/detail-status-chip";
import { EmptyState } from "@/shared/ui/empty-state";
import {
  FormInlineError,
  FormInlineWarning,
} from "@/shared/ui/form-inline-message";
import { JsonView } from "@/shared/ui/json-view";
import { SectionLabel } from "@/shared/ui/section-label";
import { Badge } from "@/shared/ui/shadcn/badge";
import { Button } from "@/shared/ui/shadcn/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/shared/ui/shadcn/tabs";
import { TabCount } from "@/shared/ui/tab-count";
import { TimelineDot, TimelineSpine } from "@/shared/ui/timeline-spine";
import { StatusBadge, capabilityLabel } from "@/shared/ui/vocab";

const EMPTY_RUN_SIBLINGS: JobListRecord[] = [];

interface JobDetailProps {
  job: JobRecord | null;
  runSiblings?: JobListRecord[];
  /** Case Evidence titles keyed by id — resolve Process/Enrich input subjects. */
  evidenceTitleById?: ReadonlyMap<string, string>;
  recipeTotal?: number;
  busy: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  cancelPlaybookBusy?: boolean;
}

function spineDotClass(status: JobListRecord["status"]): string {
  switch (status) {
    case "succeeded": {
      return "bg-success";
    }
    case "failed":
    case "cancelled": {
      return "bg-destructive";
    }
    case "running":
    case "queued": {
      return "bg-status-running";
    }
    case "blocked": {
      return "bg-warning";
    }
    default: {
      status satisfies never;
      return "bg-muted-foreground/40";
    }
  }
}

function JobPlaybookSpine({
  playbookId,
  steps,
  currentStep,
  blockedWaiting,
}: {
  playbookId: string;
  steps: JobListRecord[];
  currentStep: number;
  blockedWaiting: string | null;
}) {
  if (steps.length === 0) return null;

  return (
    <div>
      <SectionLabel as="span" density="compact">
        Playbook · {playbookId}
      </SectionLabel>
      <div className="mt-2">
        <TimelineSpine className="ml-2 pl-4">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            const isCurrent = step.playbookStep === currentStep;
            return (
              <div key={step.id} className={cn("relative", !isLast && "pb-3")}>
                <TimelineDot
                  className={cn(
                    "top-1.5 left-[-1.3rem] size-2",
                    spineDotClass(step.status)
                  )}
                />
                <p className="text-xs font-medium">
                  {i + 1} · {capabilityLabel(step.capabilityId)}{" "}
                  <span className="text-muted-foreground font-normal">
                    {step.status}
                  </span>
                </p>
                {isCurrent && blockedWaiting !== null ? (
                  <p className="text-muted-foreground text-xs">
                    {blockedWaiting}
                  </p>
                ) : null}
              </div>
            );
          })}
        </TimelineSpine>
      </div>
    </div>
  );
}

function JobLogTabBody({ logs, live }: { logs: string; live: boolean }) {
  if (!logs) {
    return (
      <EmptyState
        intent="blank-slate"
        items="logs"
        title="No logs yet"
        description="Logs appear here while the job runs."
        className="py-6"
      />
    );
  }
  return (
    <CodeBlock
      code={logs.length > 8000 ? `…\n${logs.slice(-8000)}` : logs}
      mime="text/x-sh"
      className={cn(live && "border-l-foreground/50 border-l-2")}
    />
  );
}

function JobInputTabBody({ input }: { input: JobRecord["input"] }) {
  if (Object.keys(input).length === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="input"
        title="No input"
        description="This job has no recorded input."
        className="py-6"
      />
    );
  }
  return <JsonView data={input} defaultExpanded={Infinity} />;
}

function JobOutputTabBody({
  caseId,
  jobId,
  orderedOutput,
  live,
}: {
  caseId: string;
  jobId: string;
  orderedOutput: NonNullable<JobRecord["output"]>;
  live: boolean;
}) {
  if (orderedOutput.length === 0) {
    return (
      <EmptyState
        intent="blank-slate"
        items="output"
        title="No output yet"
        description={
          live
            ? "Still running — output appears when the job finishes."
            : "This job produced no artifacts."
        }
        className="py-6"
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {orderedOutput.map((art, i) => (
        <ArtifactContent
          key={`${art.sha256}-${art.name}`}
          caseId={caseId}
          jobId={jobId}
          sha256={art.sha256}
          mime={art.mime}
          name={art.name}
          defaultOpen={artifactDefaultOpen(art.name, i)}
        />
      ))}
    </div>
  );
}

function JobDetailHeader({
  job,
  view,
}: {
  job: JobRecord;
  view: JobDetailView;
}) {
  return (
    <header className="border-border flex shrink-0 flex-col">
      <DetailContextHeader>
        <span className="text-foreground font-medium">
          {capabilityLabel(job.capabilityId)}
        </span>
        {view.inputHint === "" ? null : (
          <>
            <span aria-hidden className="text-muted-foreground/60">
              →
            </span>
            <span className="text-foreground/80 max-w-[14rem] truncate">
              {view.inputHint}
            </span>
          </>
        )}
        <DetailContextSep />
        {view.interpretFailed ? (
          <Badge
            variant="outline"
            className={cn(DETAIL_CHIP_CLASS, "bg-warning/15 text-warning")}
          >
            Interpret failed
          </Badge>
        ) : (
          <StatusBadge status={job.status} size="md" />
        )}
        {job.fromCache ? <DetailStatusChip>From cache</DetailStatusChip> : null}
        {view.showSucceededOutcomeChip ? (
          <DetailStatusChip>
            {job.suppressedCount > 0 ? "No proposal" : "Evidence only"}
          </DetailStatusChip>
        ) : null}
        {job.suppressedCount > 0 ? (
          <DetailStatusChip>{job.suppressedCount} suppressed</DetailStatusChip>
        ) : null}
        {view.live ? <DetailStatusChip>live</DetailStatusChip> : null}
        {view.showPlaybookChip ? (
          <DetailStatusChip>playbook</DetailStatusChip>
        ) : null}
      </DetailContextHeader>

      {view.interpretFailed ? (
        <FormInlineWarning className="px-3">
          Evidence captured; interpretation failed — no Proposal created.{" "}
          {job.interpretError}
        </FormInlineWarning>
      ) : null}
      <FormInlineError className="px-3">{job.error}</FormInlineError>

      <div className="border-border border-b px-2 pb-0">
        <TabsList variant="line" className="h-8">
          <TabsTrigger value="log">Log</TabsTrigger>
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger
            value="output"
            className={view.outputCount > 0 ? "relative mr-7" : undefined}
          >
            Output
            <TabCount
              n={view.outputCount}
              className="absolute top-1/2 left-[calc(100%+0.35rem)] ml-0 -translate-y-1/2"
            />
          </TabsTrigger>
        </TabsList>
      </div>
    </header>
  );
}

function JobDetailFooterBar({
  view,
  busy,
  cancelPlaybookBusy,
  onCancel,
  onCancelPlaybook,
}: {
  view: JobDetailView;
  busy: boolean;
  cancelPlaybookBusy?: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
}) {
  if (!view.showFooter) return null;
  return (
    <DetailFooter>
      {view.canCancel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={busy}
          onClick={onCancel}
          className="h-7"
        >
          Cancel
        </Button>
      ) : null}
      {view.canCancelPlaybook ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={cancelPlaybookBusy}
          onClick={onCancelPlaybook}
          className="h-7"
        >
          Cancel run
        </Button>
      ) : null}
      {view.proposalId === null ? null : (
        <Button
          nativeButton={false}
          size="sm"
          className="h-7"
          render={
            <Link to="/triage" search={{ proposalId: view.proposalId }} />
          }
        >
          Open Proposal in Triage
        </Button>
      )}
    </DetailFooter>
  );
}

export function JobDetail({
  job,
  runSiblings = EMPTY_RUN_SIBLINGS,
  evidenceTitleById,
  recipeTotal,
  busy,
  onCancel,
  onCancelPlaybook,
  cancelPlaybookBusy,
}: JobDetailProps) {
  const [tab, setTab] = useState<JobDetailTab>("log");
  const autoOutputJobIdRef = useRef<string | null>(null);

  const playbookSteps = useMemo(() => {
    if (job === null || job.playbookId === null || job.playbookId === "") {
      return null;
    }
    const steps = [...runSiblings].sort(
      (a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0)
    );
    if (steps.length === 0) return null;
    return steps;
  }, [job, runSiblings]);

  const blockedWaiting = useMemo(() => {
    if (job === null || playbookSteps === null) return null;
    if (job.status === "blocked") {
      const step = job.playbookStep;
      if (step === null) {
        return "Waiting for the previous playbook step to succeed.";
      }
      const prev = playbookSteps.find((s) => s.playbookStep === step - 1);
      if (prev?.capabilityId !== undefined && prev.capabilityId !== "") {
        return `Blocked on ${capabilityLabel(prev.capabilityId)}`;
      }
      return "Blocked on previous step";
    }
    if (
      playbookWaitingOnNextStep(
        playbookSteps,
        recipeTotal,
        job.playbookRunStatus ?? null
      )
    ) {
      return "Waiting to queue the next playbook step.";
    }
    return null;
  }, [job, playbookSteps, recipeTotal]);

  useEffect(() => {
    if (
      job?.status === "succeeded" &&
      job.output &&
      job.output.length > 0 &&
      autoOutputJobIdRef.current !== job.id
    ) {
      autoOutputJobIdRef.current = job.id;
      setTab("output");
    }
  }, [job?.id, job?.status, job?.output]);

  const orderedOutput = useMemo(
    () =>
      job?.output !== null && job?.output !== undefined && job.output.length > 0
        ? orderJobArtifacts(job.output)
        : [],
    [job]
  );

  if (!job) {
    return (
      <DetailEmpty
        title="Select a job"
        description="Choose a run from the queue to view logs, input, and output."
      />
    );
  }

  const view = buildJobDetailView({
    job,
    playbookSteps,
    evidenceTitleById,
    onCancelPlaybook,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          if (typeof v !== "string") return;
          if (v === "log" || v === "input" || v === "output") setTab(v);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <JobDetailHeader job={job} view={view} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 p-4">
            {view.capSummary !== "" || view.showAllKnownOutcome ? (
              <div className="bg-muted/30 rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs font-medium">
                  Summary
                </p>
                {view.capSummary === "" ? null : (
                  <p className="mt-0.5 text-sm leading-relaxed">
                    {view.capSummary}
                  </p>
                )}
                {view.showAllKnownOutcome ? (
                  <p
                    className={cn(
                      "text-muted-foreground text-xs leading-relaxed",
                      view.capSummary !== "" &&
                        "border-border/60 mt-2 border-t pt-2"
                    )}
                  >
                    All {job.suppressedCount} finding(s) already known or
                    previously rejected — no Proposal
                  </p>
                ) : null}
              </div>
            ) : null}

            <TabsContent value="log" className="mt-0">
              <ActiveTabBody active={tab === "log"}>
                <div className="flex flex-col gap-4">
                  {playbookSteps !== null && job.playbookId !== null ? (
                    <JobPlaybookSpine
                      playbookId={job.playbookId}
                      steps={playbookSteps}
                      currentStep={job.playbookStep ?? 0}
                      blockedWaiting={blockedWaiting}
                    />
                  ) : null}
                  <JobLogTabBody logs={view.logs} live={view.live} />
                </div>
              </ActiveTabBody>
            </TabsContent>

            <TabsContent value="input" className="mt-0">
              <ActiveTabBody active={tab === "input"}>
                <JobInputTabBody input={job.input} />
              </ActiveTabBody>
            </TabsContent>

            <TabsContent value="output" className="mt-0">
              <ActiveTabBody active={tab === "output"}>
                <JobOutputTabBody
                  caseId={job.caseId}
                  jobId={job.id}
                  orderedOutput={orderedOutput}
                  live={view.live}
                />
              </ActiveTabBody>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <JobDetailFooterBar
        view={view}
        busy={busy}
        cancelPlaybookBusy={cancelPlaybookBusy}
        onCancel={onCancel}
        onCancelPlaybook={onCancelPlaybook}
      />
    </div>
  );
}
