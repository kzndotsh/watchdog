import {
  type JobStatus,
  type PatchOp,
  CLAIM_CLASS_LABELS,
  CONFIDENCE_TIER_LABELS,
  capEgressLabel,
  capabilityIdLabel,
  ENTITY_KIND_LABELS,
  EVIDENCE_KIND_LABELS,
  IDENTIFIER_STATUS_LABELS,
  IDENTIFIER_TYPE_LABELS,
  JOB_STATUS_LABELS,
  PROPOSAL_STATUS_LABELS,
  QUESTION_STATUS_LABELS,
  RETRACT_KIND_LABELS,
  entityDisplayLabel,
  evidenceDisplayLabel,
  evidenceTitleMapFromRows,
  jobStatusSchema,
  pickPlaybookAggregateStatus,
  parseTrimmedCaseId,
  patchOpHeadline,
  playbookIdLabel,
  predicateLabel,
  proposalEntityName,
  summarizeJobInput,
  titleCase,
} from "@watchdog/schemas";

export { capEgressLabel, capabilityIdLabel, evidenceTitleMapFromRows };

function labelFromMap(value: string, labels: Record<string, string>): string {
  return labels[value] ?? titleCase(value);
}

const DISPLAY_STATUS_LABELS: Record<string, string> = {
  ...JOB_STATUS_LABELS,
  ...IDENTIFIER_STATUS_LABELS,
  ...PROPOSAL_STATUS_LABELS,
  ...RETRACT_KIND_LABELS,
  ...QUESTION_STATUS_LABELS,
};

/** Human label for an entity kind. */
export function entityKindLabel(kind: string): string {
  return labelFromMap(kind, ENTITY_KIND_LABELS);
}

/** Human label for an evidence kind. */
export function evidenceKindLabel(kind: string): string {
  return labelFromMap(kind, EVIDENCE_KIND_LABELS);
}

/** Human label for a confidence tier. */
export function confidenceLabel(value: string): string {
  return labelFromMap(value, CONFIDENCE_TIER_LABELS);
}

/** Human label for a claim class. */
export function claimClassLabel(value: string): string {
  return labelFromMap(value, CLAIM_CLASS_LABELS);
}

/** Human label for job / proposal / identifier status values. */
export function displayStatusLabel(value: string): string {
  return labelFromMap(value, DISPLAY_STATUS_LABELS);
}

/** Human label for an edge list direction. */
export function edgeDirectionLabel(direction: string): string {
  if (direction === "out") return "Outbound";
  if (direction === "in") return "Inbound";
  return labelFromMap(direction, {});
}

/** Human label for a cap catalog kind segment. */
export function capKindLabel(kind: string | null | undefined): string {
  if (!kind) return "";
  return titleCase(kind);
}

/** Short label for evidence rows — shared with core/web via schemas. */
export { evidenceDisplayLabel };

/** Short human subject for a Job input. */
export const jobInputSubject = summarizeJobInput;

/** Primary job label: playbook name when present, otherwise capability. */
export function jobCapLabel(row: {
  capabilityId: string;
  playbookId?: string | null;
}): string {
  if (row.playbookId) return playbookIdLabel(row.playbookId);
  return capabilityIdLabel(row.capabilityId);
}

export interface CollapsibleJobListRow {
  id: string;
  capabilityId: string;
  status: string;
  resultSummary: string | null;
  input: Record<string, unknown> | null | undefined;
  playbookId?: string | null;
  playbookRunId?: string | null;
  playbookStep?: number | null;
  createdAt: string;
  updatedAt?: string;
}

function collapsePlaybookRunId(
  runId: string | null | undefined
): string | undefined {
  if (runId === null || runId === undefined) return undefined;
  return parseTrimmedCaseId(runId) ?? undefined;
}

function jobListRowAt(row: CollapsibleJobListRow): number {
  return Date.parse(row.updatedAt ?? row.createdAt);
}

function pickCollapsedJobResultSummary(
  steps: readonly CollapsibleJobListRow[]
): string | null {
  const ordered = [...steps].sort((a, b) => jobListRowAt(b) - jobListRowAt(a));
  for (const step of ordered) {
    const summary = step.resultSummary?.trim();
    if (summary) return summary;
  }
  return null;
}

function collapsedJobListStatus(
  steps: readonly CollapsibleJobListRow[]
): string {
  const statuses: JobStatus[] = [];
  for (const step of steps) {
    const parsed = jobStatusSchema.safeParse(step.status);
    if (parsed.success) statuses.push(parsed.data);
  }
  return pickPlaybookAggregateStatus(statuses);
}

/** Collapse playbook step rows into one list row per run (newest-first order preserved). */
export function collapseJobListRows<T extends CollapsibleJobListRow>(
  rows: readonly T[]
): T[] {
  const seenRuns = new Set<string>();
  const byRun = new Map<string, T[]>();

  for (const row of rows) {
    const runId = collapsePlaybookRunId(row.playbookRunId);
    if (runId !== undefined) {
      const bucket = byRun.get(runId) ?? [];
      bucket.push(row);
      byRun.set(runId, bucket);
    }
  }

  const collapsed: T[] = [];
  for (const row of rows) {
    const runId = collapsePlaybookRunId(row.playbookRunId);
    if (runId === undefined) {
      collapsed.push(row);
      continue;
    }
    if (seenRuns.has(runId)) continue;
    seenRuns.add(runId);

    const steps = byRun.get(runId) ?? [row];
    const first = steps[0] ?? row;
    let latest = first;
    for (let i = 1; i < steps.length; i += 1) {
      const step = steps[i];
      if (step !== undefined && jobListRowAt(step) >= jobListRowAt(latest)) {
        latest = step;
      }
    }
    const seed =
      [...steps].sort(
        (a, b) => (a.playbookStep ?? 0) - (b.playbookStep ?? 0)
      )[0] ?? latest;

    collapsed.push({
      ...latest,
      id: runId,
      capabilityId: seed.capabilityId,
      status: collapsedJobListStatus(steps),
      resultSummary: pickCollapsedJobResultSummary(steps),
      input: seed.input,
      playbookId: seed.playbookId,
      playbookRunId: runId,
      playbookStep: seed.playbookStep,
    });
  }

  return collapsed;
}

/** Add human-readable cap label, input subject, and status label to a job row. */
export function enrichJobDisplay<
  T extends {
    capabilityId: string;
    input: Record<string, unknown> | null | undefined;
    playbookId?: string | null;
    status?: string;
  },
>(
  row: T,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): T & { capLabel: string; subject: string; statusLabel?: string } {
  return {
    ...row,
    capLabel: jobCapLabel(row),
    subject: jobInputSubject(row.input, evidenceTitleById, entityTitleById),
    ...(row.status === undefined
      ? {}
      : { statusLabel: displayStatusLabel(row.status) }),
  };
}

/** Human label for an identifier type without catalog I/O. */
export function identifierTypeLabel(type: string): string {
  return labelFromMap(type, IDENTIFIER_TYPE_LABELS);
}

/** Playbook or capability label for a proposal (no summary / entity). */
export function proposalSourceLabel(row: {
  capabilityId: string | null;
  playbookId?: string | null;
}): string {
  if (row.playbookId) return playbookIdLabel(row.playbookId);
  if (row.capabilityId) return capabilityIdLabel(row.capabilityId);
  return "";
}

export function proposalListSummary(row: {
  summary: string | null;
  capabilityId: string | null;
  playbookId?: string | null;
  patch?: PatchOp[];
  entityNames?: Record<string, string>;
  entitySlugs?: Record<string, string>;
}): string {
  const summary = row.summary?.trim();
  if (summary) return summary;
  const cap = proposalSourceLabel(row);
  const entityName = proposalEntityName({
    patch: row.patch ?? [],
    entityNames: row.entityNames,
    entitySlugs: row.entitySlugs,
  });
  if (cap && entityName) return `${cap} · ${entityName}`;
  if (cap) return cap;
  if (entityName) return entityName;
  const patch = row.patch ?? [];
  if (!patch.length) return "—";
  const first = patch[0];
  if (!first) return "—";
  return patchOpHeadline(first);
}

/** Human peer label for edge list/create output. */
export function edgePeerLabel(row: {
  peerName: string;
  peerSlug: string;
}): string {
  const label = entityDisplayLabel({
    name: row.peerName,
    slug: row.peerSlug,
  });
  return label === "" ? "—" : label;
}

export function enrichGraphWriteDisplay<
  T extends { confidence: string; opCount: number },
>(
  row: T,
  patch: PatchOp[]
): T & { confidenceLabel: string; patchSummary: string } {
  let patchSummary = "—";
  if (patch.length === 1) {
    const first = patch[0];
    patchSummary = first === undefined ? "—" : patchOpHeadline(first);
  } else if (patch.length > 1) {
    patchSummary = `${patch.length} ops`;
  }
  return {
    ...row,
    confidenceLabel: confidenceLabel(row.confidence),
    patchSummary,
  };
}

export function enrichEventDisplay<T extends { where?: string | null }>(
  row: T
): T & { whereLabel: string } {
  const where = row.where?.trim();
  return {
    ...row,
    whereLabel: where !== undefined && where !== "" ? where : "—",
  };
}

export function enrichCancelPlaybookDisplay<
  T extends { cancelledJobIds: readonly string[] },
>(row: T): T & { cancelledCount: number; statusLabel: string } {
  return {
    ...row,
    cancelledCount: row.cancelledJobIds.length,
    statusLabel: displayStatusLabel("cancelled"),
  };
}

export function enrichPlaybookRunDisplay<
  T extends { playbookId: string },
  J extends Parameters<typeof enrichJobDisplay>[0],
>(
  row: T & { jobs: J[] },
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): T & {
  playbookLabel: string;
  jobs: ReturnType<typeof enrichJobDisplay<J>>[];
} {
  return {
    ...row,
    playbookLabel: playbookIdLabel(row.playbookId),
    jobs: row.jobs.map((job) =>
      enrichJobDisplay(job, evidenceTitleById, entityTitleById)
    ),
  };
}

/** Human label for Case third-party egress policy. */
export function caseEgressLabel(allowThirdPartyEgress: boolean): string {
  return allowThirdPartyEgress ? "Third party allowed" : "Third party blocked";
}

export function enrichCaseDisplay<T extends { allowThirdPartyEgress: boolean }>(
  row: T
): T & { egressLabel: string } {
  return {
    ...row,
    egressLabel: caseEgressLabel(row.allowThirdPartyEgress),
  };
}

export function enrichEntityDisplay<T extends { kind: string }>(
  row: T
): T & { kindLabel: string } {
  return { ...row, kindLabel: entityKindLabel(row.kind) };
}

export function enrichEvidenceDisplay<T extends { kind: string }>(
  row: T
): T & { kindLabel: string } {
  return { ...row, kindLabel: evidenceKindLabel(row.kind) };
}

export function enrichIdentifierDisplay<
  T extends { type: string; confidence: string; status: string },
>(
  row: T
): T & {
  typeLabel: string;
  confidenceLabel: string;
  statusLabel: string;
} {
  return {
    ...row,
    typeLabel: identifierTypeLabel(row.type),
    confidenceLabel: confidenceLabel(row.confidence),
    statusLabel: displayStatusLabel(row.status),
  };
}

export function enrichClaimDisplay<
  T extends { confidence: string; class: string },
>(row: T): T & { confidenceLabel: string; classLabel: string } {
  return {
    ...row,
    confidenceLabel: confidenceLabel(row.confidence),
    classLabel: claimClassLabel(row.class),
  };
}

export function enrichQuestionDisplay<T extends { status: string }>(
  row: T
): T & { statusLabel: string } {
  return { ...row, statusLabel: displayStatusLabel(row.status) };
}

export function enrichProposalDisplay<
  T extends {
    status: string;
    summary: string | null;
    capabilityId: string | null;
    playbookId?: string | null;
    patch?: PatchOp[];
    entityNames?: Record<string, string>;
    entitySlugs?: Record<string, string>;
  },
>(
  row: T
): T & {
  statusLabel: string;
  summaryLabel: string;
  sourceLabel: string;
} {
  return {
    ...row,
    statusLabel: displayStatusLabel(row.status),
    summaryLabel: proposalListSummary(row),
    sourceLabel: proposalSourceLabel(row),
  };
}

export function enrichEdgeDisplay<
  T extends {
    peerName: string;
    peerSlug: string;
    predicate: string;
    direction: string;
    confidence: string;
  },
>(
  row: T
): T & {
  peer: string;
  dirLabel: string;
  predicateLabel: string;
  confidenceLabel: string;
} {
  return {
    ...row,
    peer: edgePeerLabel(row),
    dirLabel: edgeDirectionLabel(row.direction),
    predicateLabel: predicateLabel(
      row.predicate,
      row.direction === "in" ? "in" : "out"
    ),
    confidenceLabel: confidenceLabel(row.confidence),
  };
}
