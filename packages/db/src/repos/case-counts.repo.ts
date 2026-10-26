import {
  and,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
} from "drizzle-orm";
import type { Subquery } from "drizzle-orm";

import { LIVE_JOB_STATUSES, type CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { edges } from "../schema/edges";
import { entities } from "../schema/entities";
import { evidence } from "../schema/evidence";
import { identifiers } from "../schema/identifiers";
import { jobs } from "../schema/jobs";
import { tasks } from "../schema/tasks";
import { trimCaseId } from "./_scoped-ids";

/** Each count is `min(rows, cap + 1)`: the service tells "exactly cap" from "more" itself. */
export type CaseCountsRow = {
  readonly entities: number;
  readonly identifiers: number;
  readonly connections: number;
  readonly evidence: number;
  readonly liveJobs: number;
  readonly tasksOverdue: number;
  readonly tasksDueSoon: number;
};

/** The window the task counts read: the caller's day start and how far ahead "soon" reaches. */
export type TaskDueWindow = {
  /** Start of the caller's calendar day. Due before it is overdue. */
  readonly dayStart: Date;
  /** End of the "due soon" window (exclusive). */
  readonly soonEnd: Date;
};

/** Task statuses that are finished: never overdue, never due soon. */
const CLOSED_TASK_STATUSES = ["done", "dropped"] as const;

const ZERO: CaseCountsRow = {
  entities: 0,
  identifiers: 0,
  connections: 0,
  evidence: 0,
  liveJobs: 0,
  tasksOverdue: 0,
  tasksDueSoon: 0,
};

/** `count(*)` over a subquery that already holds at most `cap + 1` rows: a bounded scan, never the whole set. */
async function rowsIn(exec: DbExec, bounded: Subquery): Promise<number> {
  const [row] = await exec.select({ n: count() }).from(bounded);
  return row?.n ?? 0;
}

/** Live Jobs as the queue shows them: each standalone Job, and each playbook run with a live step. */
async function liveJobUnits(
  exec: DbExec,
  caseId: CaseId,
  cap: number
): Promise<number> {
  const live = and(
    eq(jobs.caseId, caseId),
    inArray(jobs.status, [...LIVE_JOB_STATUSES])
  );
  const [standalone, runs] = await Promise.all([
    rowsIn(
      exec,
      exec
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(live, isNull(jobs.playbookRunId)))
        .limit(cap + 1)
        .as("bounded")
    ),
    rowsIn(
      exec,
      exec
        .selectDistinct({ id: jobs.playbookRunId })
        .from(jobs)
        .where(and(live, isNotNull(jobs.playbookRunId)))
        .limit(cap + 1)
        .as("bounded")
    ),
  ]);
  return standalone + runs;
}

export const caseCountsRepo = {
  /**
   * The Case's tile counts, each capped at `cap + 1` (#571). Evidence counts the visible rows
   * (the Evidence list's default view, not the hidden ones); live Jobs are the open statuses, a
   * playbook run counting once however many of its steps are live (the Jobs queue's own unit).
   * Reads the tables directly: the Case is already authorised by the caller.
   */
  async countCapped(
    exec: DbExec,
    caseId: CaseId,
    cap: number,
    due: TaskDueWindow
  ): Promise<CaseCountsRow> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return ZERO;
    const openTask = and(
      eq(tasks.caseId, scopedCaseId),
      notInArray(tasks.status, [...CLOSED_TASK_STATUSES])
    );
    const [
      entityCount,
      identifierCount,
      connectionCount,
      evidenceCount,
      liveJobCount,
      tasksOverdue,
      tasksDueSoon,
    ] = await Promise.all([
      rowsIn(
        exec,
        exec
          .select({ id: entities.id })
          .from(entities)
          .where(eq(entities.caseId, scopedCaseId))
          .limit(cap + 1)
          .as("bounded")
      ),
      rowsIn(
        exec,
        exec
          .select({ id: identifiers.id })
          .from(identifiers)
          .where(eq(identifiers.caseId, scopedCaseId))
          .limit(cap + 1)
          .as("bounded")
      ),
      rowsIn(
        exec,
        exec
          .select({ id: edges.id })
          .from(edges)
          .where(eq(edges.caseId, scopedCaseId))
          .limit(cap + 1)
          .as("bounded")
      ),
      rowsIn(
        exec,
        exec
          .select({ id: evidence.id })
          .from(evidence)
          .where(
            and(eq(evidence.caseId, scopedCaseId), isNull(evidence.deletedAt))
          )
          .limit(cap + 1)
          .as("bounded")
      ),
      liveJobUnits(exec, scopedCaseId, cap),
      rowsIn(
        exec,
        exec
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(openTask, lt(tasks.dueDate, due.dayStart)))
          .limit(cap + 1)
          .as("bounded")
      ),
      rowsIn(
        exec,
        exec
          .select({ id: tasks.id })
          .from(tasks)
          .where(
            and(
              openTask,
              gte(tasks.dueDate, due.dayStart),
              lt(tasks.dueDate, due.soonEnd)
            )
          )
          .limit(cap + 1)
          .as("bounded")
      ),
    ]);
    return {
      entities: entityCount,
      identifiers: identifierCount,
      connections: connectionCount,
      evidence: evidenceCount,
      liveJobs: liveJobCount,
      tasksOverdue,
      tasksDueSoon,
    };
  },
};
