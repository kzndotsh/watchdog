/** Platform controlled vocab — const arrays + types. No Zod / Drizzle. */

export const ENTITY_KINDS = ["person", "infra", "org"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Trimmed display name, falling back to slug when name is blank. */
export function entityDisplayLabel(entity: {
  name: string;
  slug: string;
}): string {
  const trimmed = entity.name.trim();
  if (trimmed !== "") return trimmed;
  return entity.slug.trim();
}

export const CLAIM_CLASSES = [
  "observation",
  "assessment",
  "allegation",
  "other",
] as const;
export type ClaimClass = (typeof CLAIM_CLASSES)[number];

export const CONFIDENCE_TIERS = [
  "unverified",
  "possible",
  "confirmed",
] as const;
export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

export const IDENTIFIER_TYPES = [
  "email",
  "handle",
  "phone",
  "url",
  "domain",
  "ip",
  "crypto",
  "pgp",
  "credential",
  "other",
] as const;
export type IdentifierType = (typeof IDENTIFIER_TYPES)[number];

export const IDENTIFIER_STATUSES = ["current", "former", "unknown"] as const;
export type IdentifierStatus = (typeof IDENTIFIER_STATUSES)[number];

export const EDGE_PREDICATES = [
  "operates",
  "owns",
  "hosted_on",
  "leads",
  "founded",
  "member_of",
  "employee_of",
  "associate_of",
  "same_as",
  "suspected_as",
  "resolves_to",
  "dns_via",
  "mail_via",
  "shares_ip_with",
  "primary_domain",
  "parent_of",
  "registers",
  "related_to",
] as const;
export type EdgePredicate = (typeof EDGE_PREDICATES)[number];

export type EdgeDirection = "out" | "in";

export type EdgeKindPair = readonly [EntityKind, EntityKind];

/** Semantic Combobox groups for edge phrases (both orientations share a group). */
export const EDGE_PREDICATE_GROUPS = [
  "ownership_control",
  "roles_affiliation",
  "identity",
  "domains_hosting",
  "registration_services",
  "other",
] as const;
export type EdgePredicateGroup = (typeof EDGE_PREDICATE_GROUPS)[number];

export const EDGE_PREDICATE_GROUP_LABELS: Record<EdgePredicateGroup, string> = {
  ownership_control: "Ownership & Control",
  roles_affiliation: "Roles & Affiliation",
  identity: "Identity",
  domains_hosting: "Domains & Hosting",
  registration_services: "Registration & Services",
  other: "Other",
};

export interface EdgePredicateMeta {
  /** Outbound / canonical label (preferred directionality). */
  label: string;
  /** Inbound label; equals `label` when symmetric. */
  inverseLabel: string;
  symmetric: boolean;
  /** Phrase-picker group (UI). */
  group: EdgePredicateGroup;
  /**
   * Allowed (fromKind, toKind) for the canonical direction.
   * Empty = any pair.
   */
  validKinds: readonly EdgeKindPair[];
}

const ANY_KINDS: readonly EdgeKindPair[] = [];

const PERSON_ORG_TO_INFRA: readonly EdgeKindPair[] = [
  ["person", "infra"],
  ["org", "infra"],
];

const PERSON_ORG_TO_ORG: readonly EdgeKindPair[] = [
  ["person", "org"],
  ["org", "org"],
];

const PERSON_TO_ORG: readonly EdgeKindPair[] = [["person", "org"]];

const PERSON_ORG_TO_INFRA_OR_ORG: readonly EdgeKindPair[] = [
  ...PERSON_ORG_TO_INFRA,
  ...PERSON_ORG_TO_ORG,
];

const INFRA_TO_INFRA: readonly EdgeKindPair[] = [["infra", "infra"]];

const ORG_TO_INFRA: readonly EdgeKindPair[] = [["org", "infra"]];

const PERSON_ORG_TO_PERSON_ORG: readonly EdgeKindPair[] = [
  ["person", "person"],
  ["person", "org"],
  ["org", "person"],
  ["org", "org"],
];

/**
 * PROV-style inverse annotation — display + framing metadata.
 * Inverse labels are not enum members; only EDGE_PREDICATES persist.
 */
export const EDGE_PREDICATE_META: Record<EdgePredicate, EdgePredicateMeta> = {
  operates: {
    label: "Operates",
    inverseLabel: "Operated by",
    symmetric: false,
    group: "ownership_control",
    validKinds: PERSON_ORG_TO_INFRA_OR_ORG,
  },
  owns: {
    label: "Owns",
    inverseLabel: "Owned by",
    symmetric: false,
    group: "ownership_control",
    validKinds: PERSON_ORG_TO_INFRA_OR_ORG,
  },
  hosted_on: {
    label: "Hosted on",
    inverseLabel: "Hosts",
    symmetric: false,
    group: "domains_hosting",
    validKinds: [...INFRA_TO_INFRA, ["infra", "org"], ["infra", "person"]],
  },
  leads: {
    label: "Leads",
    inverseLabel: "Led by",
    symmetric: false,
    group: "roles_affiliation",
    validKinds: PERSON_ORG_TO_ORG,
  },
  founded: {
    label: "Founded",
    inverseLabel: "Founded by",
    symmetric: false,
    group: "roles_affiliation",
    validKinds: PERSON_ORG_TO_ORG,
  },
  member_of: {
    label: "Member of",
    inverseLabel: "Has member",
    symmetric: false,
    group: "roles_affiliation",
    validKinds: PERSON_ORG_TO_ORG,
  },
  employee_of: {
    label: "Employee of",
    inverseLabel: "Employs",
    symmetric: false,
    group: "roles_affiliation",
    validKinds: PERSON_TO_ORG,
  },
  associate_of: {
    label: "Associate of",
    inverseLabel: "Associate of",
    symmetric: true,
    group: "roles_affiliation",
    validKinds: PERSON_ORG_TO_PERSON_ORG,
  },
  same_as: {
    label: "Same as",
    inverseLabel: "Same as",
    symmetric: true,
    group: "identity",
    validKinds: ANY_KINDS,
  },
  suspected_as: {
    label: "Suspected as",
    inverseLabel: "Suspected identity of",
    symmetric: false,
    group: "identity",
    validKinds: PERSON_ORG_TO_PERSON_ORG,
  },
  resolves_to: {
    label: "Resolves to",
    inverseLabel: "Resolved from",
    symmetric: false,
    group: "domains_hosting",
    validKinds: INFRA_TO_INFRA,
  },
  dns_via: {
    label: "DNS via",
    inverseLabel: "Serves DNS for",
    symmetric: false,
    group: "registration_services",
    validKinds: INFRA_TO_INFRA,
  },
  mail_via: {
    label: "Mail via",
    inverseLabel: "Serves mail for",
    symmetric: false,
    group: "registration_services",
    validKinds: INFRA_TO_INFRA,
  },
  shares_ip_with: {
    label: "Shares IP with",
    inverseLabel: "Shares IP with",
    symmetric: true,
    group: "domains_hosting",
    validKinds: INFRA_TO_INFRA,
  },
  primary_domain: {
    label: "Primary domain",
    inverseLabel: "Primary domain of",
    symmetric: false,
    group: "domains_hosting",
    validKinds: ORG_TO_INFRA,
  },
  parent_of: {
    label: "Parent of",
    inverseLabel: "Child of",
    symmetric: false,
    group: "ownership_control",
    validKinds: [
      ["org", "org"],
      ["infra", "infra"],
    ],
  },
  registers: {
    label: "Registers",
    inverseLabel: "Registered by",
    symmetric: false,
    group: "registration_services",
    validKinds: PERSON_ORG_TO_INFRA,
  },
  related_to: {
    label: "Related to",
    inverseLabel: "Related to",
    symmetric: true,
    group: "other",
    validKinds: ANY_KINDS,
  },
};

export function isEdgePredicate(value: string): value is EdgePredicate {
  return (EDGE_PREDICATES as readonly string[]).includes(value);
}

/** Direction-aware display label (outbound = canonical, inbound = inverse). */
export function predicateLabel(
  predicate: string,
  direction: EdgeDirection = "out"
): string {
  if (!isEdgePredicate(predicate)) {
    return predicate;
  }
  const meta = EDGE_PREDICATE_META[predicate];
  return direction === "in" ? meta.inverseLabel : meta.label;
}

/** Whether canonical A→B is allowed for these entity kinds (empty validKinds = any). */
export function edgePredicateAllowsKinds(
  predicate: EdgePredicate,
  fromKind: EntityKind,
  toKind: EntityKind
): boolean {
  const pairs = EDGE_PREDICATE_META[predicate].validKinds;
  if (pairs.length === 0) return true;
  return pairs.some(([from, to]) => from === fromKind && to === toKind);
}

/** `related_to` edges require non-empty notes at create/update time. */
export function edgeRelatedToHasNotes(input: {
  predicate?: string;
  notes?: string | null;
}): boolean {
  if (input.predicate !== "related_to") return true;
  return typeof input.notes === "string" && input.notes.trim() !== "";
}

export type EdgeOrientation = "forward" | "inverse";

/**
 * Map dossier framing → absolute endpoints.
 * Symmetric: preserve existing storage order when peer unchanged; else entity→peer.
 */
export function resolveEdgeEndpoints(opts: {
  entityId: string;
  peerId: string;
  predicate: EdgePredicate;
  orientation: EdgeOrientation;
  existing?: { fromId: string; toId: string; peerId: string };
}): { fromId: string; toId: string } {
  const entityId = opts.entityId.trim();
  const peerId = opts.peerId.trim();
  const { predicate, orientation, existing } = opts;
  if (EDGE_PREDICATE_META[predicate].symmetric) {
    if (existing && existing.peerId.trim() === peerId) {
      return { fromId: existing.fromId, toId: existing.toId };
    }
    return { fromId: entityId, toId: peerId };
  }
  if (orientation === "forward") {
    return { fromId: entityId, toId: peerId };
  }
  return { fromId: peerId, toId: entityId };
}

export function edgePhraseValue(
  predicate: EdgePredicate,
  orientation: EdgeOrientation
): string {
  if (EDGE_PREDICATE_META[predicate].symmetric) {
    return `${predicate}:forward`;
  }
  return `${predicate}:${orientation}`;
}

export function parseEdgePhraseValue(
  value: string
): { predicate: EdgePredicate; orientation: EdgeOrientation } | null {
  const [predicateRaw, orientationRaw] = value.split(":");
  const predicate = predicateRaw?.trim().toLowerCase();
  const orientation = orientationRaw?.trim().toLowerCase();
  if (
    !predicate ||
    !isEdgePredicate(predicate) ||
    (orientation !== "forward" && orientation !== "inverse")
  ) {
    return null;
  }
  return { predicate, orientation };
}

export const EVIDENCE_KINDS = [
  "file",
  "url_archive",
  "attestation",
  "other",
] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const JOB_STATUSES = [
  "queued",
  "running",
  "blocked",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** Jobs that still block a playbook join. */
export const OPEN_JOB_STATUSES = ["queued", "running", "blocked"] as const;
export type OpenJobStatus = (typeof OPEN_JOB_STATUSES)[number];

export function isOpenJobStatus(status: JobStatus): boolean {
  return (OPEN_JOB_STATUSES as readonly string[]).includes(status);
}

/** When collapsing playbook step rows, pick the most significant status. */
export const PLAYBOOK_AGGREGATE_STATUS_PRIORITY: readonly JobStatus[] = [
  "running",
  "blocked",
  "queued",
  "failed",
  "cancelled",
  "succeeded",
];

export function pickPlaybookAggregateStatus(
  statuses: readonly JobStatus[]
): JobStatus {
  for (const status of PLAYBOOK_AGGREGATE_STATUS_PRIORITY) {
    if (statuses.some((value) => value === status)) return status;
  }
  return statuses[0] ?? "queued";
}

export const PLAYBOOK_SEED_KINDS = [
  "host",
  "url",
  "evidence",
  "ip",
  "email",
  "hash",
  "handle",
] as const;
export type PlaybookSeedKind = (typeof PLAYBOOK_SEED_KINDS)[number];

export function isPlaybookSeedKind(value: string): value is PlaybookSeedKind {
  return (PLAYBOOK_SEED_KINDS as readonly string[]).includes(value);
}

export const HANDOFF_BAGS = [
  "host",
  "ip",
  "url",
  "email",
  "hash",
  "handle",
] as const;
export type HandoffBag = (typeof HANDOFF_BAGS)[number];

export type JobHandoff = Partial<Record<HandoffBag, string[]>>;

export const PLAYBOOK_RUN_STATUSES = [
  "running",
  "finished",
  "cancelled",
] as const;
export type PlaybookRunStatus = (typeof PLAYBOOK_RUN_STATUSES)[number];

export const RETRACT_KINDS = ["retracted", "contested", "disproved"] as const;
export type RetractKind = (typeof RETRACT_KINDS)[number];

export const QUESTION_STATUSES = ["open", "resolved"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const PROPOSAL_STATUSES = ["pending", "accepted", "rejected"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Kanban columns — fixed enum; Task is not a Graph write. */
export const TASK_STATUSES = [
  "backlog",
  "in_progress",
  "blocked",
  "done",
  "dropped",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Channels for graph_writes audit rows (agent write today; Accept/Dossier later). */
export const GRAPH_WRITE_CHANNELS = ["agent_write"] as const;
export type GraphWriteChannel = (typeof GRAPH_WRITE_CHANNELS)[number];
