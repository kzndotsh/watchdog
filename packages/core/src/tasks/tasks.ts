import { Effect } from "effect";

import { taskListRepo } from "@watchdog/db";
import type { tasksRepo, TaskListRow, TaskRow } from "@watchdog/db";
import { TASK_BOARD_MAX, taskList } from "@watchdog/schemas/feed";
import type { TaskBoardInput } from "@watchdog/schemas/feed";
import {
  dueDatePatchSchema,
  parseGraphUuidList,
  parseTrimmedUuid,
  trimmedOrNull,
  trimmedOrUndefined,
  OPEN_TASK_STATUSES,
  PAGE_LIMIT_DEFAULT,
  type CaseId,
  type EntityKind,
  type ListInput,
  type ListPage,
  type OrganizationId,
  type TaskPriority,
  type TaskStatus,
} from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import { optionalActorId } from "../actors/require-actor-id";
import {
  dossierHistory,
  setHistoryContextEffect,
} from "../graph/graph-activity";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { listCappedEffect, listPageEffect } from "../infra/list-page";
import type { CappedList } from "../infra/list-page";
import { requireWritten } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import { tasksRepoFxDb, tasksRepoFx, casesRepoFx } from "../infra/repos-fx";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";
import { mergeColumnOrder } from "./task-order";

export type TaskRecord = {
  id: string;
  caseId: CaseId;
  entityId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

/** The Entity a listed Task is about, joined into its row for the card. */
export type TaskEntityLabel = {
  id: string;
  name: string;
  slug: string;
  kind: EntityKind;
};

/** A row of the Task list and of the board: the Task and its Entity's label. */
export type TaskListItem = TaskRecord & { entity: TaskEntityLabel | null };

/** `tasks.board`: the open Tasks, at most `TASK_BOARD_MAX`, and whether more matched. */
export type TaskBoardRecord = CappedList<TaskListItem>;

export type CreateTaskInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  entityId?: string | null;
  actorId?: string;
  /** API-key display snapshot (`api-key:...`) for the history. */
  actorLabel?: string;
  /** The API key (`apikey.id`) that made the change. */
  actorKeyId?: string;
};

export type UpdateTaskInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  taskId: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  entityId?: string | null;
  actorId?: string;
  actorLabel?: string;
  actorKeyId?: string;
};

function toRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    caseId: row.caseId,
    entityId: row.entityId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    priority: row.priority ?? null,
    dueDate: row.dueDate?.toISOString() ?? null,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toListItem(row: TaskListRow): TaskListItem {
  return { ...toRecord(row), entity: row.entity };
}

const toListItems = (rows: readonly TaskListRow[]) =>
  Effect.succeed(rows.map(toListItem));

function parseDueDateEffect(
  value: string | null | undefined
): Effect.Effect<Date | null | undefined, DomainTag> {
  if (value === undefined) {
    const unset: Date | null | undefined = undefined;
    return Effect.succeed(unset);
  }
  const parsed = dueDatePatchSchema.safeParse(value);
  if (!parsed.success) {
    return Effect.fail(new InvalidError({ reason: "Invalid due date" }));
  }
  if (parsed.data === null) return Effect.succeed(null);
  return Effect.succeed(new Date(parsed.data));
}

function taskEntityIdForCreate(
  entityId: string | null | undefined
): string | null {
  if (entityId === undefined || entityId === null) return null;
  return parseTrimmedUuid(entityId) ?? null;
}

function taskEntityIdForPatch(
  entityId: string | null | undefined
): string | null | undefined {
  if (entityId === undefined) return undefined;
  if (entityId === null) return null;
  return parseTrimmedUuid(entityId) ?? null;
}

function rejectInvalidTaskEntityId(
  raw: string | null | undefined,
  parsed: string | null | undefined
): Effect.Effect<void, DomainTag> {
  if (typeof raw === "string" && raw.trim() !== "" && parsed === null) {
    return new InvalidError({ reason: "entityId must be a valid UUID" });
  }
  return Effect.void;
}

function buildTaskUpdateFields(
  input: UpdateTaskInput,
  dueDate: Date | null | undefined,
  position: number | undefined,
  entityId: string | null | undefined
): Parameters<typeof tasksRepo.updateInCase>[3] {
  const title =
    input.title === undefined ? undefined : trimmedOrUndefined(input.title);
  return {
    ...(title === undefined ? {} : { title }),
    ...(input.description === undefined
      ? {}
      : { description: trimmedOrNull(input.description) }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(entityId === undefined ? {} : { entityId }),
    ...(position === undefined ? {} : { position }),
  };
}

/** One page of the Case's Task list (`taskList`, ADR-0007): the board's Done and Dropped columns. */
export function listTasksForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input?: ListInput<typeof taskList>
): Effect.Effect<ListPage<TaskListItem>, DomainTag, Db> {
  return Effect.gen(function* listTasksGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: taskList,
      repo: taskListRepo,
      scope: { caseId: scopedCaseId },
      input: input ?? { caseId: scopedCaseId, limit: PAGE_LIMIT_DEFAULT },
      toItems: toListItems,
    });
  });
}

/**
 * The board's open columns (`tasks.board`): every open Task of the Case that the Task list's
 * filters and search admit, in board order (position, then id), at most `TASK_BOARD_MAX`. Not a
 * page: drag and drop needs whole columns, so past the cap the board says so (`isTruncated`).
 * Ordering by position across the columns cuts each column's tail, not whole columns.
 */
export function getTaskBoardEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: Omit<TaskBoardInput, "caseId">
): Effect.Effect<TaskBoardRecord, DomainTag, Db> {
  return Effect.gen(function* getTaskBoardGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const query = taskList.queryOf({
      ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
      ...(input.priority === undefined ? {} : { priority: input.priority }),
      ...(input.q === undefined ? {} : { q: input.q }),
      status: OPEN_TASK_STATUSES,
      sort: "position.asc",
    });
    return yield* listCappedEffect({
      def: taskList,
      repo: taskListRepo,
      scope: { caseId: scopedCaseId },
      query,
      cap: TASK_BOARD_MAX,
      toItems: toListItems,
    });
  });
}

export function getTaskInCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  taskId: string
): Effect.Effect<TaskRecord, DomainTag, Db> {
  return Effect.gen(function* getTaskInCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedTaskId = yield* requireTrimmedGraphId(taskId, "Task");
    const row = yield* tasksRepoFxDb.getInCase(scopedCaseId, normalizedTaskId);
    if (!row) {
      return yield* new NotFoundError({ entity: "Task", id: normalizedTaskId });
    }
    return toRecord(row);
  });
}

export function createTaskEffect(
  input: CreateTaskInput
): Effect.Effect<TaskRecord, DomainTag, Db> {
  return Effect.gen(function* createTaskGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const entityId = taskEntityIdForCreate(input.entityId);
    yield* rejectInvalidTaskEntityId(input.entityId, entityId);
    if (entityId !== null) {
      yield* assertEntityInCaseEffect(scopedCaseId, entityId);
    }

    const title = trimmedOrUndefined(input.title);
    if (title === undefined) {
      return yield* new InvalidError({ reason: "Task title is required" });
    }

    const dueDate = yield* parseDueDateEffect(input.dueDate);
    const status = input.status ?? "backlog";

    const created = yield* transact((tx) =>
      Effect.gen(function* createTaskTx() {
        yield* setHistoryContextEffect(tx, dossierHistory(input));
        const locked = yield* casesRepoFx.lockById(tx, scopedCaseId);
        if (!locked) {
          return yield* new NotFoundError({ entity: "Case", id: scopedCaseId });
        }
        const row = yield* tasksRepoFx
          .create(tx, {
            caseId: scopedCaseId,
            title,
            description: trimmedOrNull(input.description),
            status,
            priority: input.priority ?? null,
            dueDate: dueDate === undefined ? null : dueDate,
            entityId,
          })
          .pipe(requireWritten("create Task"));
        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "task",
          action: "created",
          subjectId: row.id,
          label: row.title,
          toValue: row.status,
          actorId: optionalActorId(input.actorId),
          actorKeyId: input.actorKeyId,
        });
        return row;
      })
    );

    return toRecord(created);
  });
}

export function updateTaskEffect(
  input: UpdateTaskInput
): Effect.Effect<TaskRecord, DomainTag, Db> {
  return Effect.gen(function* updateTaskGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const taskId = yield* requireTrimmedGraphId(input.taskId, "Task");
    const existing = yield* tasksRepoFxDb.getInCase(scopedCaseId, taskId);
    if (!existing) {
      return yield* new NotFoundError({ entity: "Task", id: taskId });
    }

    const entityId = taskEntityIdForPatch(input.entityId);
    yield* rejectInvalidTaskEntityId(input.entityId, entityId ?? undefined);
    if (entityId !== undefined && entityId !== null) {
      yield* assertEntityInCaseEffect(scopedCaseId, entityId);
    }

    if (
      input.title !== undefined &&
      trimmedOrUndefined(input.title) === undefined
    ) {
      return yield* new InvalidError({ reason: "Task title is required" });
    }

    const dueDate = yield* parseDueDateEffect(input.dueDate);

    const updated = yield* transact((tx) =>
      Effect.gen(function* updateTaskTx() {
        yield* setHistoryContextEffect(tx, dossierHistory(input));
        // Lock order is Case, then Task (as in reorder), so a status move
        // cannot deadlock a reorder. The Task row lock makes "did the status
        // change" atomic: the entry's `from_value` is the status this
        // transaction replaced, not the one read before it.
        if (input.status !== undefined) {
          const locked = yield* casesRepoFx.lockById(tx, scopedCaseId);
          if (!locked) {
            return yield* new NotFoundError({
              entity: "Case",
              id: scopedCaseId,
            });
          }
        }
        // Only a requested status change needs the row lock; an edit of other
        // fields keeps the plain UPDATE.
        const current =
          input.status === undefined
            ? null
            : yield* tasksRepoFx.lockInCase(tx, scopedCaseId, taskId);
        if (input.status !== undefined && !current) {
          return yield* new NotFoundError({ entity: "Task", id: taskId });
        }
        const statusChanged =
          current !== null && input.status !== current.status;
        const destStatus = input.status;
        const position =
          statusChanged && destStatus !== undefined
            ? yield* tasksRepoFx.nextPosition(tx, scopedCaseId, destStatus)
            : undefined;
        const row = yield* tasksRepoFx.updateInCase(
          tx,
          scopedCaseId,
          taskId,
          buildTaskUpdateFields(input, dueDate, position, entityId)
        );
        if (!row) {
          return yield* new NotFoundError({ entity: "Task", id: taskId });
        }

        yield* appendActivityEffect(
          tx,
          statusChanged
            ? {
                caseId: scopedCaseId,
                kind: "task",
                action: "status_changed",
                subjectId: row.id,
                label: row.title,
                fromValue: current?.status,
                toValue: row.status,
                actorId: optionalActorId(input.actorId),
                actorKeyId: input.actorKeyId,
              }
            : {
                caseId: scopedCaseId,
                kind: "task",
                action: "updated",
                subjectId: row.id,
                label: row.title,
                actorId: optionalActorId(input.actorId),
                actorKeyId: input.actorKeyId,
              }
        );

        return row;
      })
    );

    return toRecord(updated);
  });
}

export function deleteTaskEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  taskId: string,
  actorId?: string,
  actorLabel?: string,
  actorKeyId?: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteTaskGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedTaskId = yield* requireTrimmedGraphId(taskId, "Task");
    const existing = yield* tasksRepoFxDb.getInCase(
      scopedCaseId,
      normalizedTaskId
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Task", id: normalizedTaskId });
    }

    const activityActor = optionalActorId(actorId);
    yield* transact((tx) =>
      Effect.gen(function* deleteTaskTx() {
        yield* setHistoryContextEffect(
          tx,
          dossierHistory({ actorId, actorLabel, actorKeyId })
        );
        const deleted = yield* tasksRepoFx.removeInCase(
          tx,
          scopedCaseId,
          normalizedTaskId
        );
        if (!deleted) {
          return yield* new NotFoundError({
            entity: "Task",
            id: normalizedTaskId,
          });
        }
        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "task",
          action: "deleted",
          subjectId: deleted.id,
          label: deleted.title,
          fromValue: deleted.status,
          actorId: activityActor,
          actorKeyId,
        });
      })
    );
  });
}

export type ReorderTasksInput = {
  caseId: CaseId;
  organizationId: OrganizationId;
  status: TaskStatus;
  orderedIds: string[];
  actorId?: string;
  actorLabel?: string;
  actorKeyId?: string;
};

export function reorderTasksEffect(
  input: ReorderTasksInput
): Effect.Effect<TaskRecord[], DomainTag, Db> {
  return Effect.gen(function* reorderTasksGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const orderedIds = parseGraphUuidList(input.orderedIds);
    if (orderedIds === null) {
      return yield* new InvalidError({
        reason: "Task order contains an invalid task id",
      });
    }

    const records = yield* transact((tx) =>
      Effect.gen(function* reorderTasksTx() {
        yield* setHistoryContextEffect(tx, dossierHistory(input));
        const locked = yield* casesRepoFx.lockById(tx, scopedCaseId);
        if (!locked) {
          return yield* new NotFoundError({ entity: "Case", id: scopedCaseId });
        }
        const column = yield* tasksRepoFx.listColumn(
          tx,
          scopedCaseId,
          input.status
        );
        const merged = mergeColumnOrder(
          column.map((row) => row.id),
          orderedIds
        );
        if (merged === null) {
          return yield* new InvalidError({
            reason: "Task order does not match the column",
          });
        }
        yield* tasksRepoFx.rewriteOrder(tx, scopedCaseId, input.status, merged);
        const next = yield* tasksRepoFx.listColumn(
          tx,
          scopedCaseId,
          input.status
        );
        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "task",
          action: "reordered",
          toValue: input.status,
          actorId: optionalActorId(input.actorId),
          actorKeyId: input.actorKeyId,
        });
        return next.map(toRecord);
      })
    );

    return records;
  });
}
