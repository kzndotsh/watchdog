import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";

import {
  type CaseId,
  EVIDENCE_KIND_LABELS,
  EVIDENCE_KINDS,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  OPEN_JOB_STATUSES,
  normalizeUuidList,
  trimmedOrUndefined,
  type JobStatus,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { entities } from "../schema/entities";
import { evidence } from "../schema/evidence";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { jobEvidenceIds } from "./_evidence-ids";
import { entitySlugIlikePatterns } from "./_ilike";
import {
  jobColumns,
  jobListColumns,
  normalizeJobIngressValues,
  normalizeJobPatchIngress,
  setOrTouch,
  withReplacedEvidence,
  type JobListRow,
  type JobPatch,
  type JobRow,
  type JobSettlePatch,
  type JobWithPlaybook,
  type NewJob,
} from "./_job-shapes";
import { keysetAfter, timeKey } from "./_keyset";
import type { KeysetAfter } from "./_keyset";
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
import { evidenceLinksRepo } from "./evidence-links.repo";
import { jobsCancelRepo } from "./jobs-cancel.repo";
import { jobsSettleRepo } from "./jobs-settle.repo";

export {
  type JobListRow,
  type JobPatch,
  type JobRow,
  type JobSettlePatch,
  type JobWithPlaybook,
  type NewJob,
};

export const jobsRepo = {
  async create(exec: DbExec, values: NewJob): Promise<JobRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedActorId = trimActorId(values.actorId);
    if (scopedCaseId === undefined || scopedActorId === undefined) {
      return null;
    }
    const playbookRun = resolveNullableGraphIdForWrite(values.playbookRunId);
    const retryOf = resolveNullableGraphIdForWrite(values.retryOfJobId);
    if (!playbookRun.ok || !retryOf.ok) return null;
    const normalized = normalizeJobIngressValues(values);
    if (normalized === null) return null;
    const { evidenceIds, ...columns } = normalized;
    const [created] = await exec
      .insert(jobs)
      .values({
        ...columns,
        caseId: scopedCaseId,
        actorId: scopedActorId,
        playbookRunId: playbookRun.id,
        retryOfJobId: retryOf.id,
        logs: values.logs ?? [],
      })
      .returning();
    if (created === undefined) return null;
    const ids = evidenceIds ?? [];
    await evidenceLinksRepo.linkJob(exec, scopedCaseId, created.id, ids);
    return { ...created, evidenceIds: ids };
  },

  async get(exec: DbExec, jobId: string): Promise<JobRow | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const [row] = await exec
      .select(jobColumns)
      .from(jobs)
      .where(eq(jobs.id, scopedJobId))
      .limit(1);
    return row ?? null;
  },

  async getInCase(
    exec: DbExec,
    caseId: CaseId,
    jobId: string
  ): Promise<JobWithPlaybook<JobRow> | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const [row] = await exec
      .select({
        job: jobColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
        playbookRunOutcome: playbookRuns.outcome,
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
      playbookRunOutcome: row.playbookRunOutcome ?? null,
    };
  },

  async listForCase(
    exec: DbExec,
    caseId: CaseId,
    page?: { limit: number; after?: KeysetAfter }
  ): Promise<(JobWithPlaybook<JobListRow> & { keyTime: string })[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const query = exec
      .select({
        job: jobListColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
        playbookRunOutcome: playbookRuns.outcome,
        keyTime: timeKey(jobs.updatedAt),
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          keysetAfter({
            idColumn: jobs.id,
            keys: [{ column: jobs.updatedAt, time: true }],
            direction: "desc",
            after: page?.after,
          })
        )
      )
      .orderBy(desc(jobs.updatedAt), desc(jobs.id));
    const rows = await (page === undefined ? query : query.limit(page.limit));
    return rows.map((r) => ({
      job: r.job,
      playbookId: r.playbookId ?? null,
      playbookRunStatus: r.playbookRunStatus ?? null,
      playbookRunOutcome: r.playbookRunOutcome ?? null,
      keyTime: r.keyTime,
    }));
  },

  async searchForCase(
    exec: DbExec,
    caseId: CaseId,
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
    // Ids of the Case's Evidence / Entities that match the term. Neither set depends on the
    // Job, so Postgres evaluates each once (a hashed SubPlan) and probes it per Job. A
    // correlated `exists` re-filtered the whole Case for every Job (#261). Soft-deleted
    // Evidence still matches, as before.
    const evidenceMatches = sql`(
      select e.id::text from ${evidence} e
      where e.case_id = ${scopedCaseId} and ${or(...evidenceFieldMatches)}
    )`;
    const entityMatches = sql`(
      select en.id::text from ${entities} en
      where en.case_id = ${scopedCaseId} and ${or(...entityFieldMatches)}
    )`;
    const rows = await exec
      .select({
        job: jobListColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
        playbookRunOutcome: playbookRuns.outcome,
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
            sql`(trim(${jobs.input}->>'evidenceId') in ${evidenceMatches}
              or trim(${jobs.input}->>'sourceEvidenceId') in ${evidenceMatches})`,
            sql`trim(${jobs.input}->>'entityId') in ${entityMatches}`
          )
        )
      )
      .orderBy(desc(jobs.updatedAt))
      .limit(safeLimit);
    return rows.map((r) => ({
      job: r.job,
      playbookId: r.playbookId ?? null,
      playbookRunStatus: r.playbookRunStatus ?? null,
      playbookRunOutcome: r.playbookRunOutcome ?? null,
    }));
  },

  /** Status read in a Case with `FOR UPDATE`: a concurrent status write waits, so the caller's change check is atomic. Use inside a transaction. */
  async lockStatus(
    exec: DbExec,
    caseId: CaseId,
    jobId: string
  ): Promise<{ status: JobStatus } | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const [row] = await exec
      .select({ status: jobs.status })
      .from(jobs)
      .where(
        and(eq(jobs.id, scoped.resourceId), eq(jobs.caseId, scoped.caseId))
      )
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async listRunning(exec: DbExec): Promise<
    {
      id: string;
      caseId: typeof jobs.$inferSelect.caseId;
      capabilityId: string;
      playbookRunId: string | null;
      actorId: typeof jobs.$inferSelect.actorId;
      actorKeyId: string | null;
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
        actorId: jobs.actorId,
        actorKeyId: jobs.actorKeyId,
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
    caseId: CaseId,
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
      .select(jobColumns)
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, scopedCaseId),
          eq(jobs.capabilityId, scopedCapabilityId),
          inArray(jobs.status, [...OPEN_JOB_STATUSES])
        )
      )
      .orderBy(desc(jobs.createdAt))
      .limit(safeLimit);
  },

  /** Recent succeeded jobs for a capability — enrich snapshot lookup. */
  async listSucceededForCapability(
    exec: DbExec,
    caseId: CaseId,
    capabilityId: string,
    limit = 40
  ): Promise<
    {
      input: (typeof jobs.$inferSelect)["input"];
      output: (typeof jobs.$inferSelect)["output"];
      evidenceIds: string[];
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
        evidenceIds: jobEvidenceIds,
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
      .select(jobColumns)
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
    patch: JobPatch
  ): Promise<JobRow | null> {
    const scopedJobId = trimResourceId(jobId);
    if (scopedJobId === undefined) return null;
    const normalizedPatch = normalizeJobPatchIngress(patch);
    if (normalizedPatch === null) return null;
    const { evidenceIds, ...columns } = normalizedPatch;
    const [updated] = await exec
      .update(jobs)
      .set(setOrTouch(columns))
      .where(eq(jobs.id, scopedJobId))
      .returning(jobColumns);
    return withReplacedEvidence(exec, updated, evidenceIds);
  },

  async updateInCase(
    exec: DbExec,
    caseId: CaseId,
    jobId: string,
    patch: JobPatch
  ): Promise<JobRow | null> {
    const scoped = trimScopedCaseIds(caseId, jobId);
    if (!scoped) return null;
    const normalizedPatch = normalizeJobPatchIngress(patch);
    if (normalizedPatch === null) return null;
    const { evidenceIds, ...columns } = normalizedPatch;
    const [updated] = await exec
      .update(jobs)
      .set(setOrTouch(columns))
      .where(
        and(eq(jobs.id, scoped.resourceId), eq(jobs.caseId, scoped.caseId))
      )
      .returning(jobColumns);
    return withReplacedEvidence(exec, updated, evidenceIds);
  },

  ...jobsCancelRepo,
  ...jobsSettleRepo,
};
