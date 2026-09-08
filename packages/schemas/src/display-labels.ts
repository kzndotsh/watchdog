import type {
  ClaimClass,
  ConfidenceTier,
  EntityKind,
  EvidenceKind,
  IdentifierStatus,
  IdentifierType,
  JobStatus,
  PlaybookSeedKind,
  ProposalStatus,
  QuestionStatus,
  RetractKind,
  TaskPriority,
  TaskStatus,
} from "./vocab";

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
  person: "Person",
  infra: "Infra",
  org: "Org",
};

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, string> = {
  file: "File",
  url_archive: "URL Archive",
  attestation: "Attestation",
  other: "Other",
};

export const IDENTIFIER_TYPE_LABELS: Record<IdentifierType, string> = {
  email: "Email",
  handle: "Handle",
  phone: "Phone",
  url: "URL",
  domain: "Domain",
  ip: "IP",
  crypto: "Crypto",
  pgp: "PGP",
  credential: "Credential",
  other: "Other",
};

export const IDENTIFIER_STATUS_LABELS: Record<IdentifierStatus, string> = {
  current: "Current",
  former: "Former",
  unknown: "Unknown",
};

export const CONFIDENCE_TIER_LABELS: Record<ConfidenceTier, string> = {
  unverified: "Unverified",
  possible: "Possible",
  confirmed: "Confirmed",
};

export const CLAIM_CLASS_LABELS: Record<ClaimClass, string> = {
  observation: "Observation",
  assessment: "Assessment",
  allegation: "Allegation",
  other: "Other",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  rejected: "Rejected",
};

export const RETRACT_KIND_LABELS: Record<RetractKind, string> = {
  retracted: "Retracted",
  contested: "Contested",
  disproved: "Disproved",
};

export const QUESTION_STATUS_LABELS: Record<QuestionStatus, string> = {
  open: "Open",
  resolved: "Resolved",
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  running: "Running",
  blocked: "Blocked",
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: "Backlog",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  dropped: "Dropped",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PLAYBOOK_SEED_KIND_LABELS: Record<PlaybookSeedKind, string> = {
  host: "Host",
  url: "URL",
  evidence: "Evidence",
  ip: "IP",
  email: "Email",
  hash: "Hash",
  handle: "Handle",
};

/** Human label for playbook seed kind filters and grouping. */
export function playbookSeedKindLabel(kind: PlaybookSeedKind): string {
  return PLAYBOOK_SEED_KIND_LABELS[kind];
}

/** Enum values whose display labels contain the search term (case-insensitive). */
export function enumValuesMatchingDisplayLabel<T extends string>(
  term: string,
  values: readonly T[],
  labels: Record<T, string>
): T[] {
  const q = term.replaceAll("%", "").trim().toLowerCase();
  if (q === "") return [];
  return values.filter(
    (value) =>
      value.toLowerCase().includes(q) || labels[value].toLowerCase().includes(q)
  );
}
