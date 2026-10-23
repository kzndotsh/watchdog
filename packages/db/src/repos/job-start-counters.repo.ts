import { and, eq, lt } from "drizzle-orm";

import type { JobStartLimitScope } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { jobStartCounters } from "../schema/job-start-limits";
import {
  countPlusOne,
  secondsToWindowEnd,
  windowStartSql,
} from "./_job-start-window";

export type TakeJobStart = {
  scope: JobStartLimitScope;
  /** The organization id or the API key id the start is counted for. */
  subjectId: string;
  /** Starts allowed in the window; 0 refuses every start. */
  limit: number;
  windowSeconds: number;
};

export type JobStartTaken =
  | { admitted: true; used: number }
  | { admitted: false; retryAfterSeconds: number };

export const jobStartCountersRepo = {
  /**
   * Count one start in the current window, unless the window is full. One statement: the insert
   * creates the window's row at 1, and when the row exists the upsert raises `count` only while
   * it is below `limit`. A concurrent start for the same subject waits on the row lock until the
   * first one commits or rolls back, then re-checks the new count, so two starts at the limit
   * cannot both be admitted. The count belongs to the caller's transaction: a rollback gives the
   * start back. A refusal carries the seconds until the window ends. The first start of a window
   * also deletes the subject's rows of earlier windows, so counters do not pile up.
   */
  async take(exec: DbExec, input: TakeJobStart): Promise<JobStartTaken> {
    const { scope, subjectId, limit, windowSeconds } = input;
    if (limit < 1) {
      return {
        admitted: false,
        retryAfterSeconds: await secondsToWindowEnd(exec, windowSeconds),
      };
    }
    const [row] = await exec
      .insert(jobStartCounters)
      .values({
        scope,
        subjectId,
        windowStart: windowStartSql(windowSeconds),
        count: 1,
      })
      .onConflictDoUpdate({
        target: [
          jobStartCounters.scope,
          jobStartCounters.subjectId,
          jobStartCounters.windowStart,
        ],
        set: { count: countPlusOne },
        setWhere: lt(jobStartCounters.count, limit),
      })
      .returning({ count: jobStartCounters.count });
    if (row === undefined) {
      return {
        admitted: false,
        retryAfterSeconds: await secondsToWindowEnd(exec, windowSeconds),
      };
    }
    if (row.count === 1) {
      // The first start of a window: the subject's rows of earlier windows mean nothing now.
      await exec
        .delete(jobStartCounters)
        .where(
          and(
            eq(jobStartCounters.scope, scope),
            eq(jobStartCounters.subjectId, subjectId),
            lt(jobStartCounters.windowStart, windowStartSql(windowSeconds))
          )
        );
    }
    return { admitted: true, used: row.count };
  },

  /** Starts counted for the subject in the current window (0 when none). */
  async used(
    exec: DbExec,
    input: Omit<TakeJobStart, "limit">
  ): Promise<number> {
    const [row] = await exec
      .select({ count: jobStartCounters.count })
      .from(jobStartCounters)
      .where(
        and(
          eq(jobStartCounters.scope, input.scope),
          eq(jobStartCounters.subjectId, input.subjectId),
          eq(jobStartCounters.windowStart, windowStartSql(input.windowSeconds))
        )
      )
      .limit(1);
    return row?.count ?? 0;
  },
};
