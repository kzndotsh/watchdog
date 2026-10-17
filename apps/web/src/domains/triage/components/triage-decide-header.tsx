import { Link } from "@tanstack/react-router";

import {
  buildDecideHeaderView,
  decidedEdgeClass,
  type DecideHeaderView,
} from "@/domains/triage/lib/decide-header-view";
import { proposalTitle } from "@/domains/triage/lib/filters";
import { cn } from "@/lib/utils";
import { useWorkCase } from "@/shared/hooks/use-route-case";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import { ActorMention } from "@/shared/ui/actor-mention";
import { ComposerShell } from "@/shared/ui/composer-shell";
import { DetailContextHeader } from "@/shared/ui/detail-context-header";
import { DetailContextSep } from "@/shared/ui/detail-context-sep";
import { EntityMention } from "@/shared/ui/entity-mention";
import { LocalDateTime } from "@/shared/ui/local-date-time";
import { Button } from "@/shared/ui/primitives/button";
import { StatusInk } from "@/shared/ui/vocab";
import type { ProposalRecord } from "@watchdog/core/proposals";

function ProducingCapLink({
  jobId,
  label,
}: {
  jobId: string | null | undefined;
  label: string;
}) {
  const { slug: caseSlug } = useWorkCase();
  const scopedJobId = scopeOptionalUuid(jobId);
  if (scopedJobId === undefined) {
    return <span>{label}</span>;
  }
  return (
    <Button
      nativeButton={false}
      variant="link"
      size="inline"
      className="text-foreground/80 text-xs font-normal underline-offset-2 hover:underline"
      render={
        <Link
          to="/cases/$caseSlug/collect"
          params={{ caseSlug }}
          search={{ id: scopedJobId }}
        />
      }
    >
      {label}
    </Button>
  );
}

type DecideHeaderSubjectProps = {
  view: DecideHeaderView;
  proposal: ProposalRecord;
  subject: string;
};

function DecideHeaderSubject({
  view,
  proposal,
  subject,
}: DecideHeaderSubjectProps) {
  return (
    <>
      <span className="text-foreground/80 inline-flex min-w-0 items-center gap-1">
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
    </>
  );
}

type DecideHeaderMetaProps = {
  proposal: ProposalRecord;
  view: DecideHeaderView;
  actorLabel: string | null | undefined;
};

function DecideHeaderMeta({
  proposal,
  view,
  actorLabel,
}: DecideHeaderMetaProps) {
  return (
    <>
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
    </>
  );
}

function DecideHeaderRejectReason({
  proposal,
  view,
}: {
  proposal: ProposalRecord;
  view: DecideHeaderView;
}) {
  if (
    view.isPending ||
    !view.shouldShowRejectReason ||
    proposal.rejectReason === null ||
    proposal.rejectReason === ""
  ) {
    return null;
  }

  return (
    <ComposerShell density="dense" className="gap-0 border-b px-2.5 py-2">
      <p className="text-xs leading-snug">
        <span className="text-muted-foreground">Reason · </span>
        {proposal.rejectReason}
      </p>
    </ComposerShell>
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
    isRejecting: false,
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
        <DecideHeaderSubject
          view={view}
          proposal={proposal}
          subject={subject}
        />
        <DecideHeaderMeta
          proposal={proposal}
          view={view}
          actorLabel={actorLabel}
        />
      </DetailContextHeader>

      <DecideHeaderRejectReason proposal={proposal} view={view} />
    </header>
  );
}
