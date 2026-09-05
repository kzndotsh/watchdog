import { and, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";

import type { JobStatus, PlaybookRunStatus } from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { jobs } from "../schema/jobs";
import { playbookRuns } from "../schema/playbook-runs";
import { containsPattern } from "./_ilike";

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

const ACTIVE_STATUSES: JobStatus[] = ["queued", "running"];
const CANCELLABLE_STATUSES: JobStatus[] = ["queued", "blocked", "running"];

export const jobsRepo = {
  async create(exec: DbExec, values: NewJob): Promise<JobRow | null> {
    const [created] = await exec
      .insert(jobs)
      .values({
        ...values,
        logs: values.logs ?? [],
      })
      .returning();
    return created ?? null;
  },

  async get(exec: DbExec, jobId: string): Promise<JobRow | null> {
    const [row] = await exec
      .select()
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    return row ?? null;
  },

  async getInCase(
    exec: DbExec,
    caseId: string,
    jobId: string
  ): Promise<JobWithPlaybook<JobRow> | null> {
    const [row] = await exec
      .select({
        job: jobs,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(and(eq(jobs.id, jobId), eq(jobs.caseId, caseId)))
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
    const rows = await exec
      .select({
        job: jobListColumns,
        playbookId: playbookRuns.playbookId,
        playbookRunStatus: playbookRuns.status,
      })
      .from(jobs)
      .leftJoin(playbookRuns, eq(jobs.playbookRunId, playbookRuns.id))
      .where(eq(jobs.caseId, caseId))
      .orderBy(desc(jobs.createdAt));
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
    const pattern = containsPattern(term);
    if (pattern === null) return [];
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
          eq(jobs.caseId, caseId),
          or(
            ilike(jobs.capabilityId, pattern),
            ilike(jobs.resultSummary, pattern)
          )
        )
      )
      .orderBy(desc(jobs.createdAt))
      .limit(limit);
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
    const [row] = await exec
      .select({
        status: jobs.status,
        playbookRunId: jobs.playbookRunId,
      })
      .from(jobs)
      .where(eq(jobs.id, jobId))
      .limit(1);
    return row ?? null;
  },

  async listRunning(exec: DbExec): Promise<
    {
      id: string;
      capabilityId: string;
      playbookRunId: string | null;
      updatedAt: Date;
    }[]
  > {
    return exec
      .select({
        id: jobs.id,
        capabilityId: jobs.capabilityId,
        playbookRunId: jobs.playbookRunId,
        updatedAt: jobs.updatedAt,
      })
      .from(jobs)
      .where(eq(jobs.status, "running"));
  },

  async listActiveForCapability(
    exec: DbExec,
    caseId: string,
    capabilityId: string,
    limit = 50
  ): Promise<JobRow[]> {
    return exec
      .select()
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, caseId),
          eq(jobs.capabilityId, capabilityId),
          inArray(jobs.status, ACTIVE_STATUSES)
        )
      )
      .limit(limit);
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
    return exec
      .select({
        input: jobs.input,
        output: jobs.output,
        evidenceIds: jobs.evidenceIds,
      })
      .from(jobs)
      .where(
        and(
          eq(jobs.caseId, caseId),
          eq(jobs.capabilityId, capabilityId),
          eq(jobs.status, "succeeded")
        )
      )
      .orderBy(desc(jobs.finishedAt), desc(jobs.createdAt))
      .limit(limit);
  },

  async listCancellableForPlaybookRun(
    exec: DbExec,
    caseId: string,
    playbookRunId: string
  ): Promise<{ id: string }[]> {
    return exec
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.playbookRunId, playbookRunId),
          eq(jobs.caseId, caseId),
          inArray(jobs.status, CANCELLABLE_STATUSES)
        )
      );
  },

  async listStatusesForPlaybookRun(
    exec: DbExec,
    playbookRunId: string
  ): Promise<{ status: JobStatus }[]> {
    return exec
      .select({ status: jobs.status })
      .from(jobs)
      .where(eq(jobs.playbookRunId, playbookRunId));
  },

  async listForPlaybookRun(
    exec: DbExec,
    playbookRunId: string
  ): Promise<JobRow[]> {
    return exec
      .select()
      .from(jobs)
      .where(eq(jobs.playbookRunId, playbookRunId));
  },

  async findCancelledJobIds(exec: DbExec, jobIds: string[]): Promise<string[]> {
    if (jobIds.length === 0) return [];
    const rows = await exec
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.status, "cancelled"), inArray(jobs.id, jobIds)));
    return rows.map((r) => r.id);
  },

  async update(
    exec: DbExec,
    jobId: string,
    patch: JobPatch,
    opts?: { unlessCancelled?: boolean; onlyStatuses?: JobStatus[] }
  ): Promise<JobRow | null> {
    const [updated] = await exec
      .update(jobs)
      .set(patch)
      .where(
        and(
          eq(jobs.id, jobId),
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
  ): Promise<void> {
    const now = new Date();
    await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt: now,
        error,
      })
      .where(
        and(eq(jobs.playbookRunId, playbookRunId), eq(jobs.status, "blocked"))
      );
  },

  async cancelCancellable(
    exec: DbExec,
    jobId: string,
    finishedAt: Date
  ): Promise<string | null> {
    const [updated] = await exec
      .update(jobs)
      .set({
        status: "cancelled",
        finishedAt,
      })
      .where(
        and(eq(jobs.id, jobId), inArray(jobs.status, CANCELLABLE_STATUSES))
      )
      .returning({ id: jobs.id });
    return updated?.id ?? null;
  },
};
