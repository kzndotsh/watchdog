import { Link } from "@tanstack/react-router";

import {
  buildDecideHeaderView,
  decidedEdgeClass,
} from "@/domains/triage/lib/decide-header-view";
import { proposalTitle } from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { cn } from "@/lib/utils";
import { ActorMention } from "@/shared/ui/actor-mention";
import { ComposerShell } from "@/shared/ui/composer-shell";
import {
  DetailContextHeader,
  DetailContextSep,
} from "@/shared/ui/detail-context-strip";
import { EntityMention } from "@/shared/ui/entity-mention";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/shadcn/button";
import { StatusInk } from "@/shared/ui/vocab";

function ProducingCapLink({
  jobId,
  label,
}: {
  jobId: string | null | undefined;
  label: string;
}) {
  if (jobId === null || jobId === undefined || jobId === "") {
    return <span>{label}</span>;
  }
  return (
    <Button
      nativeButton={false}
      variant="link"
      className="text-foreground/80 h-auto min-h-0 p-0 text-xs font-normal underline-offset-2 hover:underline"
      render={<Link to="/collect" search={{ id: jobId }} />}
    >
      {label}
    </Button>
  );
}

export function TriageDecideHeader({
  proposal,
  linkedIds,
}: {
  proposal: ProposalRecord;
  linkedIds: string[];
}) {
  const view = buildDecideHeaderView({
    proposal,
    linkedIds,
    rejecting: false,
  });
  const subject = view.entityName ?? view.capLabel ?? proposalTitle(proposal);
  const actorLabel = view.isPending
    ? proposal.createdByLabel
    : (proposal.decidedByLabel ?? proposal.createdByLabel);

  return (
    <header
      className={cn(
        "flex shrink-0 flex-col",
        decidedEdgeClass(proposal.status)
      )}
    >
      <DetailContextHeader>
        <span className="text-foreground/80 inline-flex min-w-0 items-center gap-1 font-medium">
          {view.entityName ? (
            <>
              <span className="text-muted-foreground shrink-0 font-normal">
                Entity
              </span>
              <EntityMention
                name={view.entityName}
                slug={view.entitySlug ?? undefined}
                size="sm"
                nameClassName="text-foreground/80"
              />
            </>
          ) : (
            <ProducingCapLink jobId={proposal.jobId} label={subject} />
          )}
        </span>
        {view.entityName !== null && view.capLabel !== null ? (
          <>
            <DetailContextSep />
            <span className="inline-flex min-w-0 items-center gap-1">
              <span className="shrink-0">From</span>
              <ProducingCapLink jobId={proposal.jobId} label={view.capLabel} />
            </span>
          </>
        ) : null}
        <DetailContextSep />
        <StatusInk status={proposal.status} />
        {proposal.agentSourced ? (
          <>
            <DetailContextSep />
            <span>agent</span>
          </>
        ) : null}
        {proposal.suppressedCount > 0 ? (
          <>
            <DetailContextSep />
            <span>{proposal.suppressedCount} suppressed</span>
          </>
        ) : null}
        {view.isPending ? null : (
          <>
            <DetailContextSep />
            <span className="tabular-nums">
              {view.timeLabel}{" "}
              <LocalDateTime value={proposal.decidedAt ?? proposal.createdAt} />
            </span>
          </>
        )}
        {actorLabel ? (
          <>
            <DetailContextSep />
            <ActorMention prefix="By" label={actorLabel} />
          </>
        ) : null}
      </DetailContextHeader>

      {view.isPending ||
      !view.showRejectReason ||
      proposal.rejectReason === null ||
      proposal.rejectReason === "" ? null : (
        <ComposerShell density="dense" className="gap-0 border-b px-2.5 py-2">
          <p className="text-xs leading-snug">
            <span className="text-muted-foreground">Reason · </span>
            {proposal.rejectReason}
          </p>
        </ComposerShell>
      )}
    </header>
  );
}
