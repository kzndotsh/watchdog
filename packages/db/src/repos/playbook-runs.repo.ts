import { and, eq, inArray } from "drizzle-orm";

import type { PlaybookRunStatus } from "@watchdog/schemas";
import { trimmedOrNull, trimmedOrUndefined } from "@watchdog/schemas";

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
  Partial<Pick<typeof playbookRuns.$inferInsert, "actorLabel">>;

export const playbookRunsRepo = {
  async create(
    exec: DbExec,
    values: NewPlaybookRun
  ): Promise<PlaybookRunRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    const scopedActorId = trimActorId(values.actorId);
    const playbookId = trimmedOrUndefined(values.playbookId);
    if (
      scopedCaseId === undefined ||
      scopedActorId === undefined ||
      playbookId === undefined
    ) {
      return null;
    }
    const actorLabel =
      values.actorLabel === undefined || values.actorLabel === null
        ? values.actorLabel
        : trimmedOrNull(values.actorLabel);
    const [created] = await exec
      .insert(playbookRuns)
      .values({
        ...values,
        caseId: scopedCaseId,
        playbookId,
        actorId: scopedActorId,
        ...(values.actorLabel === undefined ? {} : { actorLabel }),
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
    caseId: string,
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

  async listRunning(exec: DbExec): Promise<{ id: string; caseId: string }[]> {
    return exec
      .select({ id: playbookRuns.id, caseId: playbookRuns.caseId })
      .from(playbookRuns)
      .where(eq(playbookRuns.status, "running"));
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
