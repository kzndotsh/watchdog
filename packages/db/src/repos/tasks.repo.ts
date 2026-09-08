import { and, asc, eq, ilike, isNull, max, or } from "drizzle-orm";

import type { TaskStatus } from "@watchdog/schemas";
import {
  parseGraphUuidList,
  TASK_PRIORITY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
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

export interface ListTasksRowsOpts {
  entityId?: string;
  /** When true, only rows with entityId IS NULL. */
  unattachedOnly?: boolean;
  status?: TaskStatus;
}

function taskTitleForWrite(title: string): string | undefined {
  return trimmedOrUndefined(title);
}

function taskPatchForWrite(patch: TaskPatch): TaskPatch | null {
  const next: TaskPatch = { ...patch };
  if (patch.title !== undefined) {
    const title = taskTitleForWrite(patch.title);
    if (title === undefined) return null;
    next.title = title;
  }
  if (patch.description !== undefined) {
    next.description = trimmedOrNull(patch.description);
  }
  if (patch.entityId !== undefined) {
    const resolved = resolveNullableGraphIdForWrite(patch.entityId);
    if (!resolved.ok) return null;
    next.entityId = resolved.id ?? null;
  }
  return next;
}

export const tasksRepo = {
  async listForCase(
    exec: DbExec,
    caseId: string,
    opts?: ListTasksRowsOpts
  ): Promise<TaskRow[]> {
    const scopedCaseId = trimCaseId(caseId);
    if (scopedCaseId === undefined) return [];
    const scopedEntityId =
      opts?.entityId === undefined ? undefined : trimResourceId(opts.entityId);
    if (opts?.entityId !== undefined && scopedEntityId === undefined) {
      return [];
    }
    return exec
      .select(taskColumns)
      .from(tasks)
      .where(
        and(
          eq(tasks.caseId, scopedCaseId),
          scopedEntityId === undefined
            ? undefined
            : eq(tasks.entityId, scopedEntityId),
          opts?.unattachedOnly === true ? isNull(tasks.entityId) : undefined,
          opts?.status === undefined ? undefined : eq(tasks.status, opts.status)
        )
      )
      .orderBy(asc(tasks.position), asc(tasks.createdAt));
  },

  async searchForCase(
    exec: DbExec,
    caseId: string,
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
    caseId: string,
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

  async create(exec: DbExec, values: NewTask): Promise<TaskRow | null> {
    const scopedCaseId = trimCaseId(values.caseId);
    if (scopedCaseId === undefined) return null;
    const title = taskTitleForWrite(values.title);
    if (title === undefined) return null;
    const status = values.status ?? "backlog";
    const position =
      values.position ??
      (await tasksRepo.nextPosition(exec, scopedCaseId, status));
    const resolvedEntityId = resolveNullableGraphIdForWrite(values.entityId);
    if (!resolvedEntityId.ok) return null;
    const entityId = resolvedEntityId.id;
    const description =
      values.description === undefined
        ? undefined
        : trimmedOrNull(values.description);
    const [created] = await exec
      .insert(tasks)
      .values({
        ...values,
        caseId: scopedCaseId,
        title,
        status,
        position,
        ...(entityId === undefined ? {} : { entityId }),
        ...(description === undefined ? {} : { description }),
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
    const normalizedPatch = taskPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(tasks)
      .set(normalizedPatch)
      .where(eq(tasks.id, scopedTaskId))
      .returning(taskColumns);
    return updated ?? null;
  },

  async updateInCase(
    exec: DbExec,
    caseId: string,
    taskId: string,
    patch: TaskPatch
  ): Promise<TaskRow | null> {
    const scoped = trimScopedCaseIds(caseId, taskId);
    if (!scoped) return null;
    const normalizedPatch = taskPatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(tasks)
      .set(normalizedPatch)
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

  async removeInCase(
    exec: DbExec,
    caseId: string,
    taskId: string
  ): Promise<boolean> {
    const scoped = trimScopedCaseIds(caseId, taskId);
    if (!scoped) return false;
    const deleted = await exec
      .delete(tasks)
      .where(
        and(eq(tasks.id, scoped.resourceId), eq(tasks.caseId, scoped.caseId))
      )
      .returning({ id: tasks.id });
    return deleted.length > 0;
  },

  async nextPosition(
    exec: DbExec,
    caseId: string,
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
    caseId: string,
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
              eq(tasks.status, status)
            )
          )
      )
    );
    return true;
  },
};
