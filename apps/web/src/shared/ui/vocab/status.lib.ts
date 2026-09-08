import { optionsFromLabels, titleCase } from "@/shared/ui/vocab/title-case";
import type { VocabTone } from "@/shared/ui/vocab/vocab-badge";
import {
  IDENTIFIER_STATUSES,
  IDENTIFIER_STATUS_LABELS,
  JOB_STATUSES,
  JOB_STATUS_LABELS,
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS,
  RETRACT_KIND_LABELS,
  type IdentifierStatus,
  type JobStatus,
  type ProposalStatus,
  type RetractKind,
} from "@watchdog/schemas";

/** All statuses that bind to `--status-*` tokens (canonical unions only). */
export type DisplayStatus =
  | JobStatus
  | ProposalStatus
  | RetractKind
  | IdentifierStatus;

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  ...JOB_STATUS_LABELS,
  ...PROPOSAL_STATUS_LABELS,
  ...RETRACT_KIND_LABELS,
  ...IDENTIFIER_STATUS_LABELS,
};

export const JOB_STATUS_OPTIONS = optionsFromLabels(
  JOB_STATUSES,
  JOB_STATUS_LABELS
);
export const PROPOSAL_STATUS_OPTIONS = optionsFromLabels(
  PROPOSAL_STATUSES,
  PROPOSAL_STATUS_LABELS
);
export const IDENTIFIER_STATUS_OPTIONS = optionsFromLabels(
  IDENTIFIER_STATUSES,
  IDENTIFIER_STATUS_LABELS
);

export const STATUS_TONES: Record<DisplayStatus, VocabTone> = {
  queued: {
    low: "bg-status-queued-bg text-status-queued-fg",
    high: "bg-status-queued text-primary-foreground",
  },
  running: {
    low: "bg-status-running-bg text-status-running-fg",
    high: "bg-status-running text-primary-foreground",
  },
  blocked: {
    low: "bg-warning/10 text-warning",
    high: "bg-warning text-warning-foreground",
  },
  succeeded: {
    low: "bg-status-succeeded-bg text-status-succeeded-fg",
    high: "bg-status-succeeded text-primary-foreground",
  },
  failed: {
    low: "bg-status-failed-bg text-status-failed-fg",
    high: "bg-status-failed text-primary-foreground",
  },
  cancelled: {
    low: "bg-status-cancelled-bg text-status-cancelled-fg",
    high: "bg-status-cancelled text-primary-foreground",
  },
  pending: {
    low: "bg-status-pending-bg text-status-pending-fg",
    high: "bg-status-pending text-signal-foreground",
  },
  accepted: {
    low: "bg-status-accepted-bg text-status-accepted-fg",
    high: "bg-status-accepted text-primary-foreground",
  },
  rejected: {
    low: "bg-status-rejected-bg text-status-rejected-fg",
    high: "bg-status-rejected text-primary-foreground",
  },
  retracted: {
    low: "bg-status-retracted-bg text-status-retracted-fg",
    high: "bg-status-retracted text-primary-foreground",
  },
  contested: {
    low: "bg-status-contested-bg text-status-contested-fg",
    high: "bg-status-contested text-signal-foreground",
  },
  disproved: {
    low: "bg-status-disproved-bg text-status-disproved-fg",
    high: "bg-status-disproved text-primary-foreground",
  },
  current: {
    low: "bg-status-current-bg text-status-current-fg",
    high: "bg-status-current text-primary-foreground",
  },
  former: {
    low: "bg-status-former-bg text-status-former-fg",
    high: "bg-status-former text-signal-foreground",
  },
  unknown: {
    low: "bg-status-unknown-bg text-status-unknown-fg",
    high: "bg-status-unknown text-primary-foreground",
  },
};

/** Dot fill classes for StatusDot. */
export const STATUS_DOT: Record<DisplayStatus, string> = {
  queued: "bg-status-queued",
  running: "bg-status-running",
  blocked: "bg-warning",
  succeeded: "bg-status-succeeded",
  failed: "bg-status-failed",
  cancelled: "bg-status-cancelled",
  pending: "bg-status-pending",
  accepted: "bg-status-accepted",
  rejected: "bg-status-rejected",
  retracted: "bg-status-retracted",
  contested: "bg-status-contested",
  disproved: "bg-status-disproved",
  current: "bg-status-current",
  former: "bg-status-former",
  unknown: "bg-status-unknown",
};

export function statusLabel(value: DisplayStatus): string {
  return STATUS_LABELS[value] ?? titleCase(value);
}
