import { useMemo, useState } from "react";

import { ArtifactContent } from "@/domains/jobs/components/artifact-content";
import { JobAttempts } from "@/domains/jobs/components/job-attempts";
import { JobPlaybookSpine } from "@/domains/jobs/components/job-playbook-spine";
import { JobProposalLink } from "@/domains/jobs/components/job-proposal-link";
import {
  artifactDefaultOpen,
  orderJobArtifacts,
} from "@/domains/jobs/lib/artifacts";
import {
  buildJobDetailView,
  playbookWaitingMessage,
  type JobDetailTab,
  type JobDetailView,
} from "@/domains/jobs/lib/job-detail-view";
import { runOutcomeDisplay } from "@/domains/jobs/lib/playbook-run-view";
import { cn } from "@/lib/utils";
import { ActiveTabBody } from "@/shared/ui/active-tab-body";
import { ActorMention } from "@/shared/ui/actor-mention";
import { CodeBlock } from "@/shared/ui/code-block";
import { DetailContextHeader } from "@/shared/ui/detail-context-header";
import { DetailContextSep } from "@/shared/ui/detail-context-sep";
import { DetailEmpty } from "@/shared/ui/detail-empty";
import { DetailFooter } from "@/shared/ui/detail-footer";
import { EmptyState } from "@/shared/ui/empty-state";
import { FormInlineWarning } from "@/shared/ui/form-inline-message";
import { JsonView } from "@/shared/ui/json-view";
import { Button } from "@/shared/ui/primitives/button";
import { TabCount } from "@/shared/ui/tab-count";
import {
  StatusInk,
  capabilityLabel,
  jobHeadlineLabel,
} from "@/shared/ui/vocab";
import type { JobListRecord, JobRecord } from "@watchdog/core/jobs";
import type { PlaybookRunView } from "@watchdog/schemas/jobs";
import { FieldError } from "@watchdog/ui/components/field";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@watchdog/ui/components/tabs";

const EMPTY_RUN_SIBLINGS: JobListRecord[] = [];

type JobDetailProps = {
  job: JobRecord | null;
  runSiblings?: JobListRecord[];
  /** Case Evidence titles keyed by id — resolve Process/Enrich input subjects. */
  evidenceTitleById?: ReadonlyMap<string, string>;
  /** Entity display labels keyed by id — resolve entityId job inputs. */
  entityTitleById?: ReadonlyMap<string, string>;
  recipeTotal?: number;
  /** The Job's Playbook run with each step's outcome; null or absent until it loads. */
  playbookRun?: PlaybookRunView | null;
  /** Select the Job of another step of the run. */
  onSelectStep?: (jobId: string) => void;
  isBusy: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  isCancelPlaybookBusy?: boolean;
  /** Earlier and later attempts of this Job, oldest first (see `attemptChain`). */
  attempts?: JobListRecord[];
  onSelectAttempt?: (jobId: string) => void;
  /** Start a new Job with this Job's Cap and input. */
  onRetry?: () => void;
  isRetryBusy?: boolean;
  /** Open the Run form prefilled with this Job's Cap and input. */
  onEditAndRerun?: () => void;
};

type JobLogTabBodyProps = {
  logs: string;
  isLive: boolean;
  isAlongsideSpine: boolean;
};

function JobLogTabBody({ logs, isLive, isAlongsideSpine }: JobLogTabBodyProps) {
  if (!logs) {
    // The playbook spine is the log tab's content. An empty-state here
    // reads as if that spine were not there.
    if (isAlongsideSpine) return null;
    return (
      <EmptyState
        size="sm"
        intent="blank-slate"
        items="logs"
        title="No logs yet"
        description="Logs appear here while the job runs."
      />
    );
  }
  return (
    <CodeBlock
      code={logs.length > 8000 ? `…\n${logs.slice(-8000)}` : logs}
      mime="text/x-sh"
      className={cn(isLive && "border-l-foreground/50 border-l-2")}
    />
  );
}

function JobInputTabBody({ input }: { input: JobRecord["input"] }) {
  if (Object.keys(input).length === 0) {
    return (
      <EmptyState
        size="sm"
        intent="blank-slate"
        items="input"
        title="No input"
        description="This job has no recorded input."
      />
    );
  }
  return <JsonView data={input} defaultExpanded={Infinity} />;
}

type JobOutputTabBodyProps = {
  caseId: string;
  jobId: string;
  orderedOutput: NonNullable<JobRecord["output"]>;
  isLive: boolean;
};

function JobOutputTabBody({
  caseId,
  jobId,
  orderedOutput,
  isLive,
}: JobOutputTabBodyProps) {
  if (orderedOutput.length === 0) {
    return (
      <EmptyState
        size="sm"
        intent="blank-slate"
        items="output"
        title="No output yet"
        description={
          isLive
            ? "Still running — output appears when the job finishes."
            : "This job produced no artifacts."
        }
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

type JobDetailMetaChipsProps = {
  job: JobRecord;
  view: JobDetailView;
  runOutcome: ReturnType<typeof runOutcomeDisplay> | null;
};

/** The header's trailing facts: run outcome, cache, outcome kind, suppressed count, live. */
function JobDetailMetaChips({
  job,
  view,
  runOutcome,
}: JobDetailMetaChipsProps) {
  return (
    <>
      {runOutcome === null ? null : (
        <>
          <DetailContextSep />
          <span className="inline-flex items-center gap-1">
            Run
            <StatusInk status={runOutcome.status}>{runOutcome.label}</StatusInk>
          </span>
        </>
      )}
      {job.fromCache ? (
        <>
          <DetailContextSep />
          <span>From cache</span>
        </>
      ) : null}
      {view.shouldShowSucceededOutcomeChip ? (
        <>
          <DetailContextSep />
          <span>
            {job.suppressedCount > 0 ? "No proposal" : "Evidence only"}
          </span>
        </>
      ) : null}
      {job.suppressedCount > 0 ? (
        <>
          <DetailContextSep />
          <span>{job.suppressedCount} suppressed</span>
        </>
      ) : null}
      {view.isLive ? (
        <>
          <DetailContextSep />
          <span>live</span>
        </>
      ) : null}
    </>
  );
}

type JobDetailHeaderProps = {
  job: JobRecord;
  view: JobDetailView;
  playbookRun: PlaybookRunView | null;
};

function JobDetailHeader({ job, view, playbookRun }: JobDetailHeaderProps) {
  const runOutcome =
    playbookRun === null ? null : runOutcomeDisplay(playbookRun);
  return (
    <header className="border-border flex shrink-0 flex-col">
      <DetailContextHeader>
        <span className="text-foreground">{jobHeadlineLabel(job)}</span>
        {job.playbookId ? (
          <>
            <DetailContextSep />
            <span className="text-foreground/80">
              {job.playbookStep === null
                ? ""
                : `Step ${job.playbookStep + 1} · `}
              {capabilityLabel(job.capabilityId)}
            </span>
          </>
        ) : null}
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
        {view.hasInterpretFailed ? (
          <span className="text-warning">Interpret failed</span>
        ) : (
          <StatusInk status={job.status} shouldPulse={view.isLive} />
        )}
        <JobDetailMetaChips job={job} view={view} runOutcome={runOutcome} />
        <DetailContextSep />
        <ActorMention prefix="By" label={job.actorLabel} />
      </DetailContextHeader>

      {view.hasInterpretFailed ? (
        <FormInlineWarning className="px-3 py-2">
          Evidence captured; interpretation failed — no Proposal created.{" "}
          {job.interpretError}
        </FormInlineWarning>
      ) : null}
      {job.error ? (
        <div className="px-3 py-2">
          <FieldError>{job.error}</FieldError>
        </div>
      ) : null}

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

type JobDetailFooterBarProps = {
  view: JobDetailView;
  isBusy: boolean;
  isCancelPlaybookBusy?: boolean;
  onCancel: () => void;
  onCancelPlaybook?: () => void;
  isRetryBusy?: boolean;
  onRetry?: () => void;
  onEditAndRerun?: () => void;
};

function JobDetailFooterBar({
  view,
  isBusy: busy,
  isCancelPlaybookBusy: cancelPlaybookBusy,
  onCancel,
  onCancelPlaybook,
  isRetryBusy: retryBusy,
  onRetry,
  onEditAndRerun,
}: JobDetailFooterBarProps) {
  if (!view.shouldShowFooter) return null;
  return (
    <DetailFooter>
      {view.canCancel ? (
        <Button
          type="button"
          variant="outline"
          loading={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      ) : null}
      {view.canRetry && onEditAndRerun !== undefined ? (
        <Button type="button" variant="outline" onClick={onEditAndRerun}>
          Edit and re-run
        </Button>
      ) : null}
      {view.canRetry && onRetry !== undefined ? (
        <Button
          type="button"
          variant="outline"
          loading={retryBusy}
          onClick={onRetry}
        >
          Retry
        </Button>
      ) : null}
      {view.canCancelPlaybook ? (
        <Button
          type="button"
          variant="outline"
          loading={cancelPlaybookBusy}
          onClick={onCancelPlaybook}
        >
          Cancel run
        </Button>
      ) : null}
      {view.proposalId === null ? null : (
        <JobProposalLink proposalId={view.proposalId} />
      )}
    </DetailFooter>
  );
}

function JobDetailLoaded({
  job,
  runSiblings = EMPTY_RUN_SIBLINGS,
  evidenceTitleById,
  entityTitleById,
  recipeTotal,
  playbookRun = null,
  onSelectStep,
  isBusy: busy,
  onCancel,
  onCancelPlaybook,
  isCancelPlaybookBusy: cancelPlaybookBusy,
  attempts,
  onSelectAttempt,
  onRetry,
  isRetryBusy: retryBusy,
  onEditAndRerun,
}: Omit<JobDetailProps, "job"> & { job: JobRecord }) {
  const [tab, setTab] = useState<JobDetailTab>("log");
  const [isLogPinned, setIsLogPinned] = useState(false);

  const playbookSteps = useMemo(() => {
    if (job.playbookId === null || job.playbookId === "") {
      return null;
    }
    const steps = [...runSiblings].sort(
      (a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0)
    );
    if (steps.length === 0) return null;
    return steps;
  }, [job, runSiblings]);

  const waitingNote = useMemo(() => {
    if (playbookSteps === null) return null;
    return playbookWaitingMessage({
      playbookSteps,
      recipeTotal,
      playbookRunStatus: job.playbookRunStatus,
    });
  }, [job.playbookRunStatus, playbookSteps, recipeTotal]);

  const hasSpine = playbookSteps !== null || playbookRun !== null;

  const hasOutput =
    job.output !== null && job.output !== undefined && job.output.length > 0;
  const effectiveTab =
    !isLogPinned && tab === "log" && job.status === "succeeded" && hasOutput
      ? "output"
      : tab;

  const orderedOutput = useMemo(() => {
    if (
      job.output === null ||
      job.output === undefined ||
      job.output.length === 0
    ) {
      return [];
    }
    return orderJobArtifacts(job.output);
  }, [job.output]);

  const view = buildJobDetailView({
    job,
    evidenceTitleById,
    entityTitleById,
    onCancelPlaybook,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Tabs
        value={effectiveTab}
        onValueChange={(v) => {
          if (typeof v !== "string") return;
          if (v !== "log" && v !== "input" && v !== "output") return;
          setTab(v);
          setIsLogPinned(v === "log");
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <JobDetailHeader job={job} view={view} playbookRun={playbookRun} />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-col gap-4 p-4">
            {view.capSummary !== "" || view.shouldShowAllKnownOutcome ? (
              <div className="bg-muted/30 rounded-md border px-3 py-2">
                <p className="text-muted-foreground text-xs">Summary</p>
                {view.capSummary === "" ? null : (
                  <p className="mt-0.5 text-sm leading-relaxed">
                    {view.capSummary}
                  </p>
                )}
                {view.shouldShowAllKnownOutcome ? (
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

            {attempts === undefined ? null : (
              <JobAttempts
                attempts={attempts}
                currentId={job.id}
                onSelect={onSelectAttempt}
              />
            )}

            <TabsContent value="log" className="mt-0">
              <ActiveTabBody isActive={effectiveTab === "log"}>
                <div className="flex flex-col gap-4">
                  {hasSpine && job.playbookId !== null ? (
                    <JobPlaybookSpine
                      playbookId={job.playbookId}
                      steps={playbookSteps ?? EMPTY_RUN_SIBLINGS}
                      run={playbookRun}
                      currentStep={job.playbookStep ?? 0}
                      waitingNote={waitingNote}
                      onSelectStep={onSelectStep}
                    />
                  ) : null}
                  <JobLogTabBody
                    logs={view.logs}
                    isLive={view.isLive}
                    isAlongsideSpine={hasSpine && job.playbookId !== null}
                  />
                </div>
              </ActiveTabBody>
            </TabsContent>

            <TabsContent value="input" className="mt-0">
              <ActiveTabBody isActive={effectiveTab === "input"}>
                <JobInputTabBody input={job.input} />
              </ActiveTabBody>
            </TabsContent>

            <TabsContent value="output" className="mt-0">
              <ActiveTabBody isActive={effectiveTab === "output"}>
                <JobOutputTabBody
                  caseId={job.caseId}
                  jobId={job.id}
                  orderedOutput={orderedOutput}
                  isLive={view.isLive}
                />
              </ActiveTabBody>
            </TabsContent>
          </div>
        </div>
      </Tabs>

      <JobDetailFooterBar
        view={view}
        isBusy={busy}
        isCancelPlaybookBusy={cancelPlaybookBusy}
        onCancel={onCancel}
        onCancelPlaybook={onCancelPlaybook}
        isRetryBusy={retryBusy}
        onRetry={onRetry}
        onEditAndRerun={onEditAndRerun}
      />
    </div>
  );
}

export function JobDetail({
  job,
  runSiblings = EMPTY_RUN_SIBLINGS,
  evidenceTitleById,
  entityTitleById,
  recipeTotal,
  playbookRun,
  onSelectStep,
  isBusy: busy,
  onCancel,
  onCancelPlaybook,
  isCancelPlaybookBusy: cancelPlaybookBusy,
  attempts,
  onSelectAttempt,
  onRetry,
  isRetryBusy,
  onEditAndRerun,
}: JobDetailProps) {
  if (!job) {
    return (
      <DetailEmpty
        title="Select a job"
        description="Choose a run from the queue to view logs, input, and output."
      />
    );
  }

  return (
    <JobDetailLoaded
      key={job.id}
      job={job}
      runSiblings={runSiblings}
      evidenceTitleById={evidenceTitleById}
      entityTitleById={entityTitleById}
      recipeTotal={recipeTotal}
      playbookRun={playbookRun}
      onSelectStep={onSelectStep}
      isBusy={busy}
      onCancel={onCancel}
      onCancelPlaybook={onCancelPlaybook}
      isCancelPlaybookBusy={cancelPlaybookBusy}
      attempts={attempts}
      onSelectAttempt={onSelectAttempt}
      onRetry={onRetry}
      isRetryBusy={isRetryBusy}
      onEditAndRerun={onEditAndRerun}
    />
  );
}
