import {
  proposalEntityName,
  proposalEntitySlug,
  proposalPatch,
  proposalTitle,
} from "@/domains/triage/lib/filters";
import { proposalSourceLabel } from "@/shared/ui/vocab";
import type { ProposalRecord } from "@watchdog/core/proposals";
import { patchNeedsConfidence } from "@watchdog/policy/patch-needs-confidence";
import type { ProposalStatus } from "@watchdog/schemas/shared";

export type DecideEvidenceMode = "cite" | "pick";

export type DecideMode = "accepting" | "rejecting" | "decided";

export type DecideHeaderView = {
  isPending: boolean;
  decideMode: DecideMode;
  crumbLead: string;
  entityName: string | null;
  entitySlug: string | null;
  capLabel: string | null;
  shouldShowCapCrumb: boolean;
  timeLabel: "Created" | "Decided";
  shouldShowAcceptBand: boolean;
  evidenceMode: DecideEvidenceMode;
  shouldShowAttestation: boolean;
  shouldShowRejectComposer: boolean;
  shouldShowRejectReason: boolean;
  shouldShowFooterActions: boolean;
};

export function decidedEdgeClass(status: ProposalStatus): string {
  switch (status) {
    case "pending": {
      return "";
    }
    case "accepted": {
      return "border-l-success/70 border-l-2";
    }
    case "rejected": {
      return "border-l-destructive/70 border-l-2";
    }
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function buildDecideHeaderView(input: {
  proposal: ProposalRecord;
  linkedIds: string[];
  isRejecting: boolean;
}): DecideHeaderView {
  const { proposal, linkedIds, isRejecting } = input;
  const isPending = proposal.status === "pending";
  const entityName = proposalEntityName(proposal);
  const entitySlug = proposalEntitySlug(proposal);
  const capLabel = proposalSourceLabel(proposal) || null;
  const needsConfidence =
    isPending && patchNeedsConfidence(proposalPatch(proposal));
  const hasJobCites = linkedIds.length > 0;

  let decideMode: DecideMode;
  if (!isPending) {
    decideMode = "decided";
  } else if (isRejecting) {
    decideMode = "rejecting";
  } else {
    decideMode = "accepting";
  }

  return {
    isPending,
    decideMode,
    crumbLead: entityName ?? capLabel ?? proposalTitle(proposal),
    entityName,
    entitySlug,
    capLabel,
    shouldShowCapCrumb: entityName !== null && capLabel !== null,
    timeLabel: isPending ? "Created" : "Decided",
    shouldShowAcceptBand: needsConfidence,
    evidenceMode: hasJobCites ? "cite" : "pick",
    shouldShowAttestation: needsConfidence && !hasJobCites,
    shouldShowRejectComposer: decideMode === "rejecting",
    shouldShowRejectReason:
      proposal.status === "rejected" && Boolean(proposal.rejectReason),
    shouldShowFooterActions: decideMode === "accepting",
  };
}
