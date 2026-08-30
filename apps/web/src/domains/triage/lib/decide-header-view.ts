import {
  proposalEntityName,
  proposalEntitySlug,
  proposalTitle,
} from "@/domains/triage/lib/filters";
import type { ProposalRecord } from "@/domains/triage/triage.functions";
import { capabilityLabel } from "@/shared/ui/vocab";
import { patchNeedsConfidence } from "@watchdog/policy";
import type { ProposalStatus } from "@watchdog/schemas";

export type DecideEvidenceMode = "cite" | "pick";

export type DecideMode = "accepting" | "rejecting" | "decided";

export interface DecideHeaderView {
  isPending: boolean;
  decideMode: DecideMode;
  crumbLead: string;
  entityName: string | null;
  entitySlug: string | null;
  capLabel: string | null;
  showCapCrumb: boolean;
  timeLabel: "Created" | "Decided";
  showAcceptBand: boolean;
  evidenceMode: DecideEvidenceMode;
  showAttestation: boolean;
  showRejectComposer: boolean;
  showRejectReason: boolean;
  showFooterActions: boolean;
}

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
  rejecting: boolean;
}): DecideHeaderView {
  const { proposal, linkedIds, rejecting } = input;
  const isPending = proposal.status === "pending";
  const entityName = proposalEntityName(proposal);
  const entitySlug = proposalEntitySlug(proposal);
  const capLabel = capabilityLabel(proposal.capabilityId) || null;
  const needsConfidence = isPending && patchNeedsConfidence(proposal.patch);
  const hasJobCites = linkedIds.length > 0;

  let decideMode: DecideMode;
  if (!isPending) {
    decideMode = "decided";
  } else if (rejecting) {
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
    showCapCrumb: entityName !== null && capLabel !== null,
    timeLabel: isPending ? "Created" : "Decided",
    showAcceptBand: needsConfidence,
    evidenceMode: hasJobCites ? "cite" : "pick",
    showAttestation: needsConfidence && !hasJobCites,
    showRejectComposer: decideMode === "rejecting",
    showRejectReason:
      proposal.status === "rejected" && Boolean(proposal.rejectReason),
    showFooterActions: decideMode === "accepting",
  };
}
