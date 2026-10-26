import { EDGE_PREDICATE_META } from "./vocab";
import type {
  ClaimClass,
  ConfidenceTier,
  EdgePredicate,
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
import type { CollectRowKind, CollectRowState } from "./vocab-collect-queue";

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

/** A Connection's predicate in its canonical (outbound) direction ("Owns", "Related to"). */
export const EDGE_PREDICATE_LABELS: Record<EdgePredicate, string> = {
  operates: EDGE_PREDICATE_META.operates.label,
  owns: EDGE_PREDICATE_META.owns.label,
  hosted_on: EDGE_PREDICATE_META.hosted_on.label,
  leads: EDGE_PREDICATE_META.leads.label,
  founded: EDGE_PREDICATE_META.founded.label,
  member_of: EDGE_PREDICATE_META.member_of.label,
  employee_of: EDGE_PREDICATE_META.employee_of.label,
  associate_of: EDGE_PREDICATE_META.associate_of.label,
  same_as: EDGE_PREDICATE_META.same_as.label,
  suspected_as: EDGE_PREDICATE_META.suspected_as.label,
  resolves_to: EDGE_PREDICATE_META.resolves_to.label,
  dns_via: EDGE_PREDICATE_META.dns_via.label,
  mail_via: EDGE_PREDICATE_META.mail_via.label,
  shares_ip_with: EDGE_PREDICATE_META.shares_ip_with.label,
  primary_domain: EDGE_PREDICATE_META.primary_domain.label,
  parent_of: EDGE_PREDICATE_META.parent_of.label,
  registers: EDGE_PREDICATE_META.registers.label,
  related_to: EDGE_PREDICATE_META.related_to.label,
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
  succeeded: "Succeeded",
  failed: "Failed",
  cancelled: "Cancelled",
};

/** Collect's queue row states a user can pick (`hidden` is the `hidden` flag, not a state choice). */
export const COLLECT_STATE_LABELS: Record<
  Exclude<CollectRowState, "hidden">,
  string
> = {
  queued: "Queued",
  running: "Running",
  unprocessed: "Unprocessed",
  landed: "Landed",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const COLLECT_KIND_LABELS: Record<CollectRowKind, string> = {
  evidence: "Evidence",
  run: "Playbook run",
  job: "Job",
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

/**
 * Enum values whose display labels (or raw values) contain the search term, case-insensitive.
 * Every character is literal, `%`, `_` and `\` included, as in the ILIKE side of the same search
 * (`containsPattern`): `for%mer` matches no label.
 */
export function enumValuesMatchingDisplayLabel<T extends string>(
  term: string,
  values: readonly T[],
  labels: Record<T, string>
): T[] {
  const q = term.trim().toLowerCase();
  if (q === "") return [];
  return values.filter(
    (value) =>
      value.toLowerCase().includes(q) || labels[value].toLowerCase().includes(q)
  );
}
