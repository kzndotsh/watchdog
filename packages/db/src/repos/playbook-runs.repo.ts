import { and, eq, inArray } from "drizzle-orm";

import type {
  CaseId,
  PlaybookRunOutcome,
  PlaybookRunStatus,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { playbookRuns } from "../schema/playbook-runs";
import {
  trimActorId,
  trimCaseId,
  trimResourceId,
  trimScopedCaseIds,
} from "./_scoped-ids";

export type PlaybookRunRow = typeof playbookRuns.$inferSelect;

export type NewPlaybookRun = Pick<
  typeof playbookRuns.$inferInsert,
  "caseId" | "playbookId" | "seed" | "status" | "actorId"
> &
  Partial<Pick<typeof playbookRuns.$inferInsert, "actorLabel" | "actorKeyId">>;

export const playbookRunsRepo = {
  async create(
    exec: DbExec,
    values: NewPlaybookRun
  ): Promise<PlaybookRunRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedActorId = trimActorId(values.actorId);
    if (scopedCaseId === undefined || scopedActorId === undefined) {
      return null;
    }
    const [created] = await exec
      .insert(playbookRuns)
      .values({
        ...values,
        caseId: scopedCaseId,
        actorId: scopedActorId,
      })
      .returning();
    return created ?? null;
  },

  async get(
    exec: DbExec,
    playbookRunId: string
  ): Promise<PlaybookRunRow | null> {
    const scopedId = trimResourceId(playbookRunId);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select()
      .from(playbookRuns)
      .where(eq(playbookRuns.id, scopedId))
      .limit(1);
    return row ?? null;
  },

  async lock(
    exec: DbExec,
    playbookRunId: string
  ): Promise<PlaybookRunRow | null> {
    const scopedId = trimResourceId(playbookRunId);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select()
      .from(playbookRuns)
      .where(eq(playbookRuns.id, scopedId))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async getInCase(
    exec: DbExec,
    caseId: CaseId,
    playbookRunId: string
  ): Promise<PlaybookRunRow | null> {
    const scoped = trimScopedCaseIds(caseId, playbookRunId);
    if (!scoped) return null;
    const [row] = await exec
      .select()
      .from(playbookRuns)
      .where(
        and(
          eq(playbookRuns.id, scoped.resourceId),
          eq(playbookRuns.caseId, scoped.caseId)
        )
      )
      .limit(1);
    return row ?? null;
  },

  async listRunning(exec: DbExec): Promise<{ id: string; caseId: CaseId }[]> {
    return exec
      .select({ id: playbookRuns.id, caseId: playbookRuns.caseId })
      .from(playbookRuns)
      .where(eq(playbookRuns.status, "running"));
  },

  /** Mark every running playbook run of a Case cancelled (a Case delete stops its work). */
  async cancelRunningForCase(
    exec: DbExec,
    caseId: CaseId,
    finishedAt: Date
  ): Promise<string[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const rows = await exec
      .update(playbookRuns)
      .set({ status: "cancelled", finishedAt })
      .where(
        and(
          eq(playbookRuns.caseId, scopedCaseId),
          eq(playbookRuns.status, "running")
        )
      )
      .returning({ id: playbookRuns.id });
    return rows.map((row) => row.id);
  },

  /** Finish a running run with its outcome. Null when the run is not `running` (a cancelled run stays cancelled). */
  async finish(
    exec: DbExec,
    playbookRunId: string,
    outcome: PlaybookRunOutcome,
    finishedAt: Date
  ): Promise<PlaybookRunRow | null> {
    const scopedId = trimResourceId(playbookRunId);
    if (scopedId === undefined) return null;
    const [updated] = await exec
      .update(playbookRuns)
      .set({ status: "finished", outcome, finishedAt })
      .where(
        and(eq(playbookRuns.id, scopedId), eq(playbookRuns.status, "running"))
      )
      .returning();
    return updated ?? null;
  },

  /** Put a finished run back to `running` (a retry resumes it): outcome and finish time cleared. Null when it is not `finished`. */
  async reopen(
    exec: DbExec,
    playbookRunId: string
  ): Promise<PlaybookRunRow | null> {
    const scopedId = trimResourceId(playbookRunId);
    if (scopedId === undefined) return null;
    const [updated] = await exec
      .update(playbookRuns)
      .set({ status: "running", outcome: null, finishedAt: null })
      .where(
        and(eq(playbookRuns.id, scopedId), eq(playbookRuns.status, "finished"))
      )
      .returning();
    return updated ?? null;
  },

  async setStatus(
    exec: DbExec,
    playbookRunId: string,
    status: PlaybookRunStatus,
    finishedAt: Date,
    opts?: { onlyStatuses?: PlaybookRunStatus[] }
  ): Promise<PlaybookRunRow | null> {
    const scopedId = trimResourceId(playbookRunId);
    if (scopedId === undefined) return null;
    const [updated] = await exec
      .update(playbookRuns)
      .set({ status, finishedAt })
      .where(
        and(
          eq(playbookRuns.id, scopedId),
          opts?.onlyStatuses
            ? inArray(playbookRuns.status, opts.onlyStatuses)
            : undefined
        )
      )
      .returning();
    return updated ?? null;
  },
};
