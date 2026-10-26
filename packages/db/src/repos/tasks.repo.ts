import { and, asc, count, eq, ilike, lt, max, ne, or } from "drizzle-orm";

import {
  type CaseId,
  type TaskStatus,
  parseGraphUuidList,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { openTaskStatus } from "../schema/_open-task";
import { entities } from "../schema/entities";
import { tasks } from "../schema/tasks";
import { entitySlugIlikePatterns } from "./_ilike";
import { inArrayForDisplayLabelMatch } from "./_label-search";
import { clampSearchLimit } from "./_limits";
import {
  trimCaseId,
  trimResourceId,
  trimScopedCaseIds,
  resolveNullableGraphIdForWrite,
} from "./_scoped-ids";

export const taskColumns = {
  id: tasks.id,
  caseId: tasks.caseId,
  entityId: tasks.entityId,
  title: tasks.title,
  description: tasks.description,
  status: tasks.status,
  priority: tasks.priority,
  dueDate: tasks.dueDate,
  position: tasks.position,
  createdAt: tasks.createdAt,
  updatedAt: tasks.updatedAt,
  createdBy: tasks.createdBy,
  updatedBy: tasks.updatedBy,
} as const;

export type TaskRow = {
  [K in keyof typeof taskColumns]: (typeof tasks.$inferSelect)[K &
    keyof typeof tasks.$inferSelect];
};

export type NewTask = Pick<
  typeof tasks.$inferInsert,
  "caseId" | "title" | "status"
> &
  Partial<
    Pick<
      typeof tasks.$inferInsert,
      "id" | "entityId" | "description" | "priority" | "dueDate" | "position"
    >
  >;

export type TaskPatch = Partial<
  Pick<
    typeof tasks.$inferInsert,
    | "title"
    | "description"
    | "status"
    | "priority"
    | "dueDate"
    | "entityId"
    | "position"
  >
>;

function taskPatchEntityId(patch: TaskPatch): TaskPatch | null {
  if (patch.entityId === undefined) return patch;
  const resolved = resolveNullableGraphIdForWrite(patch.entityId);
  if (!resolved.ok) return null;
  return { ...patch, entityId: resolved.id ?? null };
}

export const tasksRepo = {
  /**
   * One status column of the Case in board order (position, then id), unpaged: the reorder's
   * read inside its transaction. A column is what one drag rewrites; the board itself reads
   * through `taskListRepo` with a cap.
   */
  async listColumn(
    exec: DbExec,
    caseId: CaseId,
    status: TaskStatus
  ): Promise<TaskRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select(taskColumns)
      .from(tasks)
      .where(and(eq(tasks.caseId, scopedCaseId), eq(tasks.status, status)))
      .orderBy(asc(tasks.position), asc(tasks.id));
  },

  /**
   * The Case's open Tasks due before `soonEnd` (overdue ones included), by due date then id, at
   * most `limit`: the Dashboard's due list. Served by `tasks_case_open_due_idx`.
   */
  async listDue(
    exec: DbExec,
    caseId: CaseId,
    window: { readonly soonEnd: Date; readonly limit: number }
  ): Promise<TaskRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    return exec
      .select(taskColumns)
      .from(tasks)
      .where(
        and(
          eq(tasks.caseId, scopedCaseId),
          openTaskStatus(tasks.status),
          lt(tasks.dueDate, window.soonEnd)
        )
      )
      .orderBy(asc(tasks.dueDate), asc(tasks.id))
      .limit(window.limit);
  },

  /** min(open Tasks due before `soonEnd`, cap + 1): the due list's capped total. */
  async countDue(
    exec: DbExec,
    caseId: CaseId,
    soonEnd: Date,
    cap: number
  ): Promise<number> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return 0;
    const bounded = exec
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.caseId, scopedCaseId),
          openTaskStatus(tasks.status),
          lt(tasks.dueDate, soonEnd)
        )
      )
      .limit(cap + 1)
      .as("bounded");
    const [row] = await exec.select({ n: count() }).from(bounded);
    return row?.n ?? 0;
  },

  async searchForCase(
    exec: DbExec,
    caseId: CaseId,
    term: string,
    limit: number
  ): Promise<TaskRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const entitySlugMatches = slugPatterns.map((p) => ilike(entities.slug, p));
    const statusLabelMatch = inArrayForDisplayLabelMatch(
      tasks.status,
      TASK_STATUSES,
      TASK_STATUS_LABELS,
      term
    );
    const priorityLabelMatch = inArrayForDisplayLabelMatch(
      tasks.priority,
      TASK_PRIORITIES,
      TASK_PRIORITY_LABELS,
      term
    );
    const entityFieldMatch = and(
      eq(entities.caseId, scopedCaseId),
      or(
        ilike(entities.name, pattern),
        ...entitySlugMatches,
        ilike(entities.summary, pattern),
        ilike(entities.notes, pattern)
      )
    );
    return exec
      .select(taskColumns)
      .from(tasks)
      .leftJoin(entities, eq(tasks.entityId, entities.id))
      .where(
        and(
          eq(tasks.caseId, scopedCaseId),
          or(
            ilike(tasks.title, pattern),
            ilike(tasks.description, pattern),
            ilike(tasks.status, pattern),
            ilike(tasks.priority, pattern),
            ...(statusLabelMatch ? [statusLabelMatch] : []),
            ...(priorityLabelMatch ? [priorityLabelMatch] : []),
            entityFieldMatch
          )
        )
      )
      .orderBy(asc(tasks.title))
      .limit(safeLimit);
  },

  async getInCase(
    exec: DbExec,
    caseId: CaseId,
    taskId: string
  ): Promise<TaskRow | null> {
    const scoped = trimScopedCaseIds(caseId, taskId);
    if (!scoped) return null;
    const [row] = await exec
      .select(taskColumns)
      .from(tasks)
      .where(
        and(eq(tasks.id, scoped.resourceId), eq(tasks.caseId, scoped.caseId))
      )
      .limit(1);
    return row ?? null;
  },

  /** `getInCase` with `FOR UPDATE`: a concurrent write waits, so a status change check is atomic. Use inside a transaction. */
  async lockInCase(
    exec: DbExec,
    caseId: CaseId,
    taskId: string
  ): Promise<TaskRow | null> {
    const scoped = trimScopedCaseIds(caseId, taskId);
    if (!scoped) return null;
    const [row] = await exec
      .select(taskColumns)
      .from(tasks)
      .where(
        and(eq(tasks.id, scoped.resourceId), eq(tasks.caseId, scoped.caseId))
      )
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async create(exec: DbExec, values: NewTask): Promise<TaskRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedCaseId === undefined) return null;
    const status = values.status ?? "backlog";
    const position =
      values.position ??
      (await tasksRepo.nextPosition(exec, scopedCaseId, status));
    const resolvedEntityId = resolveNullableGraphIdForWrite(values.entityId);
    if (!resolvedEntityId.ok) return null;
    const entityId = resolvedEntityId.id;
    const [created] = await exec
      .insert(tasks)
      .values({
        ...values,
        caseId: scopedCaseId,
        status,
        position,
        ...(entityId === undefined ? {} : { entityId }),
      })
      .returning(taskColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    taskId: string,
    patch: TaskPatch
  ): Promise<TaskRow | null> {
    const scopedTaskId = trimResourceId(taskId);
    if (scopedTaskId === undefined) return null;
    const patchToSet = taskPatchEntityId(patch);
    if (patchToSet === null) return null;
    const [updated] = await exec
      .update(tasks)
      .set(patchToSet)
      .where(eq(tasks.id, scopedTaskId))
      .returning(taskColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: CaseId,
    taskId: string,
    patch: TaskPatch
  ): Promise<TaskRow | null> {
    const scoped = trimScopedCaseIds(caseId, taskId);
    if (!scoped) return null;
    const patchToSet = taskPatchEntityId(patch);
    if (patchToSet === null) return null;
    const [updated] = await exec
      .update(tasks)
      .set(patchToSet)
      .where(
        and(eq(tasks.id, scoped.resourceId), eq(tasks.caseId, scoped.caseId))
      )
      .returning(taskColumns);
    return updated ?? null;
  },

  async remove(exec: DbExec, taskId: string): Promise<boolean> {
    const scopedTaskId = trimResourceId(taskId);
    if (scopedTaskId === undefined) return false;
    const deleted = await exec
      .delete(tasks)
      .where(eq(tasks.id, scopedTaskId))
      .returning({ id: tasks.id });
    return deleted.length > 0;
  },

  /** Delete a Task in the Case and return the deleted row (its title and status are what the entry records). */
  async removeInCase(
    exec: DbExec,
    caseId: CaseId,
    taskId: string
  ): Promise<TaskRow | null> {
    const scoped = trimScopedCaseIds(caseId, taskId);
    if (!scoped) return null;
    const [deleted] = await exec
      .delete(tasks)
      .where(
        and(eq(tasks.id, scoped.resourceId), eq(tasks.caseId, scoped.caseId))
      )
      .returning(taskColumns);
    return deleted ?? null;
  },

  async nextPosition(
    exec: DbExec,
    caseId: CaseId,
    status: TaskStatus
  ): Promise<number> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return 0;
    const [row] = await exec
      .select({ max: max(tasks.position) })
      .from(tasks)
      .where(and(eq(tasks.caseId, scopedCaseId), eq(tasks.status, status)));
    return (row?.max ?? -1) + 1;
  },

  async rewriteOrder(
    exec: DbExec,
    caseId: CaseId,
    status: TaskStatus,
    orderedIds: readonly string[]
  ): Promise<boolean> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return false;
    const normalized = parseGraphUuidList(orderedIds);
    if (normalized === null) return false;
    await Promise.all(
      normalized.map((id, index) =>
        exec
          .update(tasks)
          .set({ position: index })
          .where(
            and(
              eq(tasks.id, id),
              eq(tasks.caseId, scopedCaseId),
              eq(tasks.status, status),
              // Only a Task that moves is a change.
              ne(tasks.position, index)
            )
          )
      )
    );
    return true;
  },
};
