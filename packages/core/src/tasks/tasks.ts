import { Effect } from "effect";

import { activityEventsRepo, db, tasksRepo, type TaskRow } from "@watchdog/db";
import {
  trimmedOrNull,
  type TaskPriority,
  type TaskStatus,
} from "@watchdog/schemas";

import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
} from "../graph/patch/guards";
import { notifyTaskChangedEffect } from "../infra/events";
import { tryDb } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  InvalidError,
  NotFoundError,
  type DomainTag,
} from "../infra/tagged-errors";

export interface TaskRecord {
  id: string;
  caseId: string;
  entityId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority | null;
  dueDate: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  caseId: string;
  organizationId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  entityId?: string | null;
  actorId?: string;
}

export interface UpdateTaskInput {
  caseId: string;
  organizationId: string;
  taskId: string;
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  entityId?: string | null;
  actorId?: string;
}

export interface ListTasksOpts {
  entityId?: string;
  unattachedOnly?: boolean;
  status?: TaskStatus;
}

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

function parseDueDateEffect(
  value: string | null | undefined
): Effect.Effect<Date | null | undefined, DomainTag> {
  if (value === undefined) {
    const unset: Date | null | undefined = undefined;
    return Effect.succeed(unset);
  }
  if (value === null || value === "") return Effect.succeed(null);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return Effect.fail(new InvalidError({ reason: "Invalid due date" }));
  }
  return Effect.succeed(parsed);
}

function buildTaskUpdateFields(
  input: UpdateTaskInput,
  dueDate: Date | null | undefined,
  position: number | undefined
): Parameters<typeof tasksRepo.update>[2] {
  return {
    ...(input.title === undefined ? {} : { title: input.title.trim() }),
    ...(input.description === undefined
      ? {}
      : { description: trimmedOrNull(input.description) }),
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.priority === undefined ? {} : { priority: input.priority }),
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(input.entityId === undefined ? {} : { entityId: input.entityId }),
    ...(position === undefined ? {} : { position }),
  };
}

export function listTasksForCaseEffect(
  caseId: string,
  organizationId: string,
  opts?: ListTasksOpts
): Effect.Effect<TaskRecord[], DomainTag> {
  return Effect.gen(function* listTasksGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() => tasksRepo.listForCase(db, caseId, opts));
    return rows.map(toRecord);
  });
}

export function getTaskInCaseEffect(
  caseId: string,
  organizationId: string,
  taskId: string
): Effect.Effect<TaskRecord, DomainTag> {
  return Effect.gen(function* getTaskInCaseGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const row = yield* tryDb(() => tasksRepo.getInCase(db, caseId, taskId));
    if (!row) {
      return yield* new NotFoundError({ resource: "Task not found" });
    }
    return toRecord(row);
  });
}

export function createTaskEffect(
  input: CreateTaskInput
): Effect.Effect<TaskRecord, DomainTag> {
  return Effect.gen(function* createTaskGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    if (input.entityId) {
      yield* assertEntityInCaseEffect(input.caseId, input.entityId);
    }

    const dueDate = yield* parseDueDateEffect(input.dueDate);
    const status = input.status ?? "backlog";

    const created = yield* transact((tx) =>
      Effect.gen(function* createTaskTx() {
        const row = yield* tryDb(() =>
          tasksRepo.create(tx, {
            caseId: input.caseId,
            title: input.title.trim(),
            description: trimmedOrNull(input.description),
            status,
            priority: input.priority ?? null,
            dueDate: dueDate === undefined ? null : dueDate,
            entityId: input.entityId ?? null,
          })
        );
        if (!row) {
          return yield* new InvalidError({ reason: "Failed to create Task" });
        }
        yield* tryDb(() =>
          activityEventsRepo.create(tx, {
            caseId: input.caseId,
            kind: "task",
            action: "created",
            subjectId: row.id,
            label: row.title,
            toValue: row.status,
            actorId: input.actorId,
          })
        );
        return row;
      })
    );

    yield* notifyTaskChangedEffect(input.caseId, input.entityId ?? undefined);
    return toRecord(created);
  });
}

export function updateTaskEffect(
  input: UpdateTaskInput
): Effect.Effect<TaskRecord, DomainTag> {
  return Effect.gen(function* updateTaskGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);
    const existing = yield* tryDb(() =>
      tasksRepo.getInCase(db, input.caseId, input.taskId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Task not found" });
    }

    if (input.entityId) {
      yield* assertEntityInCaseEffect(input.caseId, input.entityId);
    }

    const dueDate = yield* parseDueDateEffect(input.dueDate);
    const statusChanged =
      input.status !== undefined && input.status !== existing.status;

    const updated = yield* transact((tx) =>
      Effect.gen(function* updateTaskTx() {
        const destStatus = input.status;
        const position =
          statusChanged && destStatus !== undefined
            ? yield* tryDb(() =>
                tasksRepo.nextPosition(tx, input.caseId, destStatus)
              )
            : undefined;
        const row = yield* tryDb(() =>
          tasksRepo.update(
            tx,
            input.taskId,
            buildTaskUpdateFields(input, dueDate, position)
          )
        );
        if (!row) {
          return yield* new InvalidError({ reason: "Failed to update Task" });
        }

        if (statusChanged) {
          yield* tryDb(() =>
            activityEventsRepo.create(tx, {
              caseId: input.caseId,
              kind: "task",
              action: "status_changed",
              subjectId: row.id,
              label: row.title,
              fromValue: existing.status,
              toValue: row.status,
              actorId: input.actorId,
            })
          );
        }

        return row;
      })
    );

    yield* notifyTaskChangedEffect(
      input.caseId,
      updated.entityId ?? existing.entityId ?? undefined
    );
    return toRecord(updated);
  });
}

export function deleteTaskEffect(
  caseId: string,
  organizationId: string,
  taskId: string,
  actorId?: string
): Effect.Effect<void, DomainTag> {
  return Effect.gen(function* deleteTaskGen() {
    yield* assertCaseInOrgEffect(caseId, organizationId);
    const existing = yield* tryDb(() =>
      tasksRepo.getInCase(db, caseId, taskId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Task not found" });
    }

    yield* transact((tx) =>
      Effect.gen(function* deleteTaskTx() {
        const ok = yield* tryDb(() => tasksRepo.remove(tx, taskId));
        if (!ok) {
          return yield* new InvalidError({
            reason: "Failed to delete Task",
          });
        }
        yield* tryDb(() =>
          activityEventsRepo.create(tx, {
            caseId,
            kind: "task",
            action: "deleted",
            subjectId: existing.id,
            label: existing.title,
            fromValue: existing.status,
            actorId,
          })
        );
      })
    );

    yield* notifyTaskChangedEffect(caseId, existing.entityId ?? undefined);
  });
}

export interface ReorderTasksInput {
  caseId: string;
  organizationId: string;
  status: TaskStatus;
  orderedIds: string[];
}

export function reorderTasksEffect(
  input: ReorderTasksInput
): Effect.Effect<TaskRecord[], DomainTag> {
  return Effect.gen(function* reorderTasksGen() {
    yield* assertCaseInOrgEffect(input.caseId, input.organizationId);

    const records = yield* transact((tx) =>
      Effect.gen(function* reorderTasksTx() {
        const rows = yield* tryDb(() =>
          tasksRepo.listForCase(tx, input.caseId, {
            status: input.status,
          })
        );
        const existing = new Set(rows.map((row) => row.id));
        if (input.orderedIds.length !== existing.size) {
          return yield* new InvalidError({
            reason: "Task order does not match the column",
          });
        }
        const seen = new Set<string>();
        for (const id of input.orderedIds) {
          if (!existing.has(id) || seen.has(id)) {
            return yield* new InvalidError({
              reason: "Task order does not match the column",
            });
          }
          seen.add(id);
        }
        yield* tryDb(() =>
          tasksRepo.rewriteOrder(
            tx,
            input.caseId,
            input.status,
            input.orderedIds
          )
        );
        const next = yield* tryDb(() =>
          tasksRepo.listForCase(tx, input.caseId, {
            status: input.status,
          })
        );
        return next.map(toRecord);
      })
    );

    yield* notifyTaskChangedEffect(input.caseId);
    return records;
  });
}
