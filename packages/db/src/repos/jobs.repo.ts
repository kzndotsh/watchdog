import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  OPEN_JOB_STATUSES,
  normalizeUuidList,
  normalizeJobInput,
  jobInputGraphIdFieldIssues,
  parseGraphUuidList,
  trimmedOrNull,
  trimmedOrUndefined,
  type JobStatus,
  type PlaybookRunStatus,
  type JsonObject,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { evidence } from "../schema/evidence";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { entitySlugIlikePatterns } from "./_ilike";
import {
  inArrayForDisplayLabelMatch,
  sqlCatalogIdIlike,
  sqlInDisplayLabelMatch,
} from "./_label-search";
import { clampSearchLimit } from "./_limits";
import {
  trimActorId,
  trimCaseId,
  trimResourceId,
  trimScopedCaseIds,
  resolveNullableGraphIdForWrite,
} from "./_scoped-ids";

export type JobRow = typeof jobs.$inferSelect;

export const jobListColumns = {
  id: jobs.id,
  caseId: jobs.caseId,
  capabilityId: jobs.capabilityId,
  input: jobs.input,
  output: jobs.output,
  status: jobs.status,
  error: jobs.error,
  interpretError: jobs.interpretError,
  proposalId: jobs.proposalId,
  evidenceIds: jobs.evidenceIds,
  resultSummary: jobs.resultSummary,
  fromCache: jobs.fromCache,
  suppressedCount: jobs.suppressedCount,
  actorId: jobs.actorId,
  actorLabel: jobs.actorLabel,
  playbookRunId: jobs.playbookRunId,
  playbookStep: jobs.playbookStep,
  playbookFanIndex: jobs.playbookFanIndex,
  createdAt: jobs.createdAt,
  updatedAt: jobs.updatedAt,
  startedAt: jobs.startedAt,
  finishedAt: jobs.finishedAt,
} as const;

export type JobListRow = {
  [K in keyof typeof jobListColumns]: (typeof jobs.$inferSelect)[K &
    keyof typeof jobs.$inferSelect];
};

/** Read model: a Job plus the playbook it belongs to, if any. */
export interface JobWithPlaybook<Row> {
  job: Row;
  playbookId: string | null;
  playbookRunStatus: PlaybookRunStatus | null;
}

export type NewJob = Pick<
  typeof jobs.$inferInsert,
  "caseId" | "capabilityId" | "input" | "status" | "actorId"
> &
  Partial<
    Pick<
      typeof jobs.$inferInsert,
      | "logs"
      | "playbookRunId"
      | "playbookStep"
      | "playbookFanIndex"
      | "output"
      | "evidenceIds"
      | "handoff"
      | "actorLabel"
    >
  >;

export type JobPatch = Partial<
  Pick<
    typeof jobs.$inferInsert,
    | "status"
    | "error"
    | "interpretError"
    | "proposalId"
    | "resultSummary"
    | "fromCache"
    | "suppressedCount"
    | "logs"
    | "output"
    | "evidenceIds"
    | "handoff"
    | "input"
    | "startedAt"
    | "finishedAt"
  >
>;

/** Queued, running, or blocked — still in-flight for per-evidence cap dedup. */
const OPEN_CAP_DEDUP_STATUSES: JobStatus[] = [...OPEN_JOB_STATUSES];
const CANCELLABLE_STATUSES: JobStatus[] = ["queued", "blocked", "running"];

function withNormalizedEvidenceIds<T extends { evidenceIds?: string[] | null }>(
  values: T
): T | null {
  if (values.evidenceIds === undefined) return values;
  const parsed = parseGraphUuidList(values.evidenceIds ?? []);
  if (parsed === null) return null;
  return { ...values, evidenceIds: parsed };
}

function withNormalizedJobInput<T extends { input?: JsonObject }>(
  values: T
): T | null {
  if (values.input === undefined) return values;
  if (jobInputGraphIdFieldIssues(values.input).length > 0) return null;
  return { ...values, input: normalizeJobInput(values.input) };
}

function jobValuesForWrite<
  T extends { evidenceIds?: string[] | null; input?: JsonObject },
>(values: T): T | null {
  const withEvidence = withNormalizedEvidenceIds(values);
  if (withEvidence === null) return null;
  return withNormalizedJobInput(withEvidence);
}

function jobPatchForWrite(patch: JobPatch): JobPatch | null {
  const next = jobValuesForWrite(patch);
  if (next === null) return null;
  if (patch.resultSummary !== undefined) {
    next.resultSummary = trimmedOrNull(patch.resultSummary);
  }
  if (patch.error !== undefined) {
    next.error = trimmedOrNull(patch.error);
  }
  if (patch.interpretError !== undefined) {
    next.interpretError = trimmedOrNull(patch.interpretError);
  }
  if (patch.proposalId !== undefined) {
    const resolved = resolveNullableGraphIdForWrite(patch.proposalId);
    if (!resolved.ok) return null;
    next.proposalId = resolved.id ?? null;
  }
  return next;
}

export const jobsRepo = {
  async create(exec: DbExec, values: NewJob): Promise<JobRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedActorId = trimActorId(values.actorId);
    const capabilityId = trimmedOrUndefined(values.capabilityId);
    if (
      scopedCaseId === undefined ||
      scopedActorId === undefined ||
      capabilityId === undefined
    ) {
      return null;
    }
    let playbookRunId: string | null | undefined;
    if (values.playbookRunId === undefined) {
      playbookRunId = undefined;
    } else {
      const resolved = resolveNullableGraphIdForWrite(values.playbookRunId);
      if (!resolved.ok) return null;
      playbookRunId = resolved.id ?? null;
    }
    const actorLabel =
      values.actorLabel === undefined || values.actorLabel === null
        ? values.actorLabel
        : trimmedOrNull(values.actorLabel);
    const normalized = jobValuesForWrite(values);
    if (normalized === null) return null;
    const [created] = await exec
      .insert(jobs)
      .values({
        ...normalized,
        caseId: scopedCaseId,
        capabilityId,
        actorId: scopedActorId,
        playbookRunId,
        ...(values.actorLabel === undefined ? {} : { actorLabel }),
        logs: values.logs ?? [],
      })
      .returning();
    return created ?? null;
  },

  async get(exec: DbExec, jobId: string): Promise<JobRow | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const [row] = await exec
      .select()
      .from(jobs)
      .where(eq(jobs.id, scopedJobId))
      .limit(1);
    return row ?? null;
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    jobId: string
  ): Promise<JobWithPlaybook<JobRow> | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const [row] = await exec
      .select({
        job: jobs,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(eq(jobs.id, scoped.resourceId), eq(jobs.caseId, scoped.caseId))
      )
      .limit(1);
    if (!row) return null;
    return {
      job: row.job,
      playbookId: row.playbookId ?? null,
      playbookRunStatus: row.playbookRunStatus ?? null,
    };
  },

  async listForCase(
    exec: DbExec,
    caseId: string
  ): Promise<JobWithPlaybook<JobListRow>[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const rows = await exec
      .select({
        job: jobListColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(eq(jobs.caseId, scopedCaseId))
      .orderBy(desc(jobs.updatedAt));
    return rows.map((r) => ({
      job: r.job,
      playbookId: r.playbookId ?? null,
      playbookRunStatus: r.playbookRunStatus ?? null,
    }));
  },

  async searchForCase(
    exec: DbExec,
    caseId: string,
    term: string,
    limit: number
  ): Promise<JobWithPlaybook<JobListRow>[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const entitySlugMatches = slugPatterns.map((p) => sql`en.slug ilike ${p}`);
    const entityFieldMatches = [
      sql`en.name ilike ${pattern}`,
      ...entitySlugMatches,
      sql`coalesce(en.summary, '') ilike ${pattern}`,
      sql`coalesce(en.notes, '') ilike ${pattern}`,
    ];
    const statusLabelMatch = inArrayForDisplayLabelMatch(
      jobs.status,
      JOB_STATUSES,
      JOB_STATUS_LABELS,
      term
    );
    const evidenceKindLabelMatch = sqlInDisplayLabelMatch(
      "e.kind",
      EVIDENCE_KINDS,
      EVIDENCE_KIND_LABELS,
      term
    );
    const evidenceFieldMatches = [
      sql`e.label ilike ${pattern}`,
      sql`e.source_url ilike ${pattern}`,
      sql`coalesce(e.text, '') ilike ${pattern}`,
      sql`coalesce(e.notes, '') ilike ${pattern}`,
      sql`coalesce(e.sha256, '') ilike ${pattern}`,
      sql`coalesce(e.mime, '') ilike ${pattern}`,
      sql`e.kind::text ilike ${pattern}`,
      ...(evidenceKindLabelMatch ? [evidenceKindLabelMatch] : []),
    ];
    const rows = await exec
      .select({
        job: jobListColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          or(
            sqlCatalogIdIlike("jobs.capability_id", pattern),
            ilike(jobs.resultSummary, pattern),
            ilike(jobs.error, pattern),
            ilike(jobs.interpretError, pattern),
            ilike(jobs.status, pattern),
            ...(statusLabelMatch ? [statusLabelMatch] : []),
            sqlCatalogIdIlike("playbook_runs.playbook_id", pattern),
            sql`(${jobs.input})::text ilike ${pattern}`,
            sql`exists (
              select 1 from ${evidence} e
              where e.case_id = ${jobs.caseId}
              and (
                e.id::text = trim(${jobs.input}->>'evidenceId')
                or e.id::text = trim(${jobs.input}->>'sourceEvidenceId')
              )
              and (${sql.join(evidenceFieldMatches, sql` or `)})
            )`,
            sql`exists (
              select 1 from ${entities} en
              where en.case_id = ${jobs.caseId}
              and en.id::text = trim(${jobs.input}->>'entityId')
              and (${sql.join(entityFieldMatches, sql` or `)})
            )`
          )
        )
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(safeLimit);
    return rows.map((r) => ({
      job: r.job,
      playbookId: r.playbookId ?? null,
      playbookRunStatus: r.playbookRunStatus ?? null,
    }));
  },

  async getStatusAndPlaybook(
    exec: DbExec,
    jobId: string
  ): Promise<{
    status: JobStatus;
    playbookRunId: string | null;
  } | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const [row] = await exec
      .select({
        status: jobs.status,
        playbookRunId: jobs.playbookRunId,
      })
      .from(jobs)
      .where(eq(jobs.id, scopedJobId))
      .limit(1);
    return row ?? null;
  },

  async listRunning(exec: DbExec): Promise<
    {
      id: string;
      caseId: string;
      capabilityId: string;
      playbookRunId: string | null;
      startedAt: Date | null;
      updatedAt: Date;
    }[]
  > {
    return exec
      .select({
        id: jobs.id,
        caseId: jobs.caseId,
        capabilityId: jobs.capabilityId,
        playbookRunId: jobs.playbookRunId,
        startedAt: jobs.startedAt,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.status, "running"));
  },

  async listQueuedStale(
    exec: DbExec,
    updatedBefore: Date
  ): Promise<{ id: string; capabilityId: string }[]> {
    return exec
      .select({
        id: jobs.id,
        capabilityId: jobs.capabilityId,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(jobs.status, "queued"),
          lt(jobs.updatedAt, updatedBefore),
          or(isNull(jobs.playbookRunId), eq(playbookRuns.status, "running"))
        )
      );
  },

  async listActiveForCapability(
    exec: DbExec,
    caseId: string,
    capabilityId: string,
    limit = 50
  ): Promise<JobRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    const scopedCapabilityId = trimmedOrUndefined(capabilityId);
    if (scopedCaseId === undefined || scopedCapabilityId === undefined) {
      return [];
    }
    const safeLimit = clampSearchLimit(limit);
    return exec
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          eq(jobs.capabilityId, scopedCapabilityId),
          inArray(jobs.status, OPEN_CAP_DEDUP_STATUSES)
        )
      )
      .orderBy(desc(jobs.createdAt))
      .limit(safeLimit);
  },

  /** Recent succeeded jobs for a capability — enrich snapshot lookup. */
  async listSucceededForCapability(
    exec: DbExec,
    caseId: string,
    capabilityId: string,
    limit = 40
  ): Promise<
    {
      input: (typeof jobs.$inferSelect)["input"];
      output: (typeof jobs.$inferSelect)["output"];
      evidenceIds: (typeof jobs.$inferSelect)["evidenceIds"];
    }[]
  > {
    const scopedCaseId = trimCaseId(caseId);
    const scopedCapabilityId = trimmedOrUndefined(capabilityId);
    if (scopedCaseId === undefined || scopedCapabilityId === undefined) {
      return [];
    }
    const safeLimit = clampSearchLimit(limit);
    return exec
      .select({
        input: jobs.input,
        output: jobs.output,
        evidenceIds: jobs.evidenceIds,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          eq(jobs.capabilityId, scopedCapabilityId),
          eq(jobs.status, "succeeded")
        )
      )
      .orderBy(desc(jobs.finishedAt), desc(jobs.createdAt))
      .limit(safeLimit);
  },

  async listCancellableForPlaybookRun(
    exec: DbExec,
    caseId: string,
    playbookRunId: string
  ): Promise<{ id: string }[]> {
    const scoped = trimScopedCaseIds(caseId, playbookRunId);
    if (!scoped) return [];
    return exec
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.playbookRunId, scoped.resourceId),
          eq(jobs.caseId, scoped.caseId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      );
  },

  async listStatusesForPlaybookRun(
    exec: DbExec,
    playbookRunId: string
  ): Promise<{ status: JobStatus }[]> {
    const scopedPlaybookRunId = trimResourceId(playbookRunId);
    if (scopedPlaybookRunId === undefined) return [];
    return exec
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.playbookRunId, scopedPlaybookRunId));
  },

  async listForPlaybookRun(
    exec: DbExec,
    playbookRunId: string
  ): Promise<JobRow[]> {
    const scopedPlaybookRunId = trimResourceId(playbookRunId);
    if (scopedPlaybookRunId === undefined) return [];
    return exec
      .select()
      .from(jobs)
      .where(eq(jobs.playbookRunId, scopedPlaybookRunId));
  },

  async findCancelledJobIds(exec: DbExec, jobIds: string[]): Promise<string[]> {
    const normalized = normalizeUuidList(jobIds);
    if (normalized.length === 0) return [];
    const rows = await exec
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.status, "cancelled"), inArray(jobs.id, normalized)));
    return rows.map((r) => r.id);
  },

  async update(
    exec: DbExec,
    jobId: string,
    patch: JobPatch,
    opts?: { unlessCancelled?: boolean; onlyStatuses?: JobStatus[] }
  ): Promise<JobRow | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const normalizedPatch = jobPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(jobs)
      .set(normalizedPatch)
      .where(
        and(
          eq(jobs.id, scopedJobId),
          opts?.unlessCancelled === true
            ? ne(jobs.status, "cancelled")
            : undefined,
          opts?.onlyStatuses
            ? inArray(jobs.status, opts.onlyStatuses)
            : undefined
        )
      )
      .returning();
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    jobId: string,
    patch: JobPatch,
    opts?: { unlessCancelled?: boolean; onlyStatuses?: JobStatus[] }
  ): Promise<JobRow | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const normalizedPatch = jobPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(jobs)
      .set(normalizedPatch)
      .where(
        and(
          eq(jobs.id, scoped.resourceId),
          eq(jobs.caseId, scoped.caseId),
          opts?.unlessCancelled === true
            ? ne(jobs.status, "cancelled")
            : undefined,
          opts?.onlyStatuses
            ? inArray(jobs.status, opts.onlyStatuses)
            : undefined
        )
      )
      .returning();
    return updated ?? null;
  },

  async abandonBlockedForPlaybook(
    exec: DbExec,
    playbookRunId: string,
    error: string
  ): Promise<string[]> {
    const scopedPlaybookRunId = trimResourceId(playbookRunId);
    if (scopedPlaybookRunId === undefined) return [];
    const now = new Date();
    const rows = await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt: now,
        error,
      })
      .where(
        and(
          eq(jobs.playbookRunId, scopedPlaybookRunId),
          eq(jobs.status, "blocked")
        )
      )
      .returning({ id: jobs.id });
    return rows.map((row) => row.id);
  },

  async cancelCancellable(
    exec: DbExec,
    jobId: string,
    finishedAt: Date
  ): Promise<string | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const [updated] = await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt,
      })
      .where(
        and(
          eq(jobs.id, scopedJobId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      )
      .returning({ id: jobs.id });
    return updated?.id ?? null;
  },

  async cancelCancellableInCase(
    exec: DbExec,
    caseId: string,
    jobId: string,
    finishedAt: Date
  ): Promise<string | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const [updated] = await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt,
      })
      .where(
        and(
          eq(jobs.id, scoped.resourceId),
          eq(jobs.caseId, scoped.caseId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      )
      .returning({ id: jobs.id });
    return updated?.id ?? null;
  },
};
