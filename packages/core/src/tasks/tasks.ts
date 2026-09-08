import { Effect } from "effect";

import {
  activityEventsRepo,
  casesRepo,
  db,
  tasksRepo,
  type TaskRow,
} from "@watchdog/db";
import {
  dueDatePatchSchema,
  parseGraphUuidList,
  parseTrimmedCaseId,
  trimmedOrNull,
  trimmedOrUndefined,
  type TaskPriority,
  type TaskStatus,
} from "@watchdog/schemas";

import { optionalActorId } from "../actors/require-actor-id";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
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
  return parseTrimmedCaseId(entityId) ?? null;
}

function taskEntityIdForPatch(
  entityId: string | null | undefined
): string | null | undefined {
  if (entityId === undefined) return undefined;
  if (entityId === null) return null;
  return parseTrimmedCaseId(entityId) ?? null;
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

export function listTasksForCaseEffect(
  caseId: string,
  organizationId: string,
  opts?: ListTasksOpts
): Effect.Effect<TaskRecord[], DomainTag> {
  return Effect.gen(function* listTasksGen() {
    let entityId: string | undefined;
    if (opts?.entityId === undefined) {
      entityId = undefined;
    } else {
      const parsed = parseTrimmedCaseId(opts.entityId);
      if (parsed === null) {
        return yield* new InvalidError({
          reason: "entityId must be a valid UUID",
        });
      }
      entityId = parsed;
    }
    if (opts?.unattachedOnly && entityId !== undefined) {
      return yield* new InvalidError({
        reason: "entityId and unattachedOnly are mutually exclusive",
      });
    }
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const rows = yield* tryDb(() =>
      tasksRepo.listForCase(db, scopedCaseId, {
        ...opts,
        entityId,
      })
    );
    return rows.map(toRecord);
  });
}

export function getTaskInCaseEffect(
  caseId: string,
  organizationId: string,
  taskId: string
): Effect.Effect<TaskRecord, DomainTag> {
  return Effect.gen(function* getTaskInCaseGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedTaskId = yield* requireTrimmedGraphId(
      taskId,
      "Task not found"
    );
    const row = yield* tryDb(() =>
      tasksRepo.getInCase(db, scopedCaseId, normalizedTaskId)
    );
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
        const locked = yield* tryDb(() => casesRepo.lockById(tx, scopedCaseId));
        if (!locked) {
          return yield* new NotFoundError({ resource: "Case not found" });
        }
        const row = yield* tryDb(() =>
          tasksRepo.create(tx, {
            caseId: scopedCaseId,
            title,
            description: trimmedOrNull(input.description),
            status,
            priority: input.priority ?? null,
            dueDate: dueDate === undefined ? null : dueDate,
            entityId,
          })
        );
        if (!row) {
          return yield* new InvalidError({ reason: "Failed to create Task" });
        }
        yield* tryDb(() =>
          activityEventsRepo.create(tx, {
            caseId: scopedCaseId,
            kind: "task",
            action: "created",
            subjectId: row.id,
            label: row.title,
            toValue: row.status,
            actorId: optionalActorId(input.actorId),
          })
        );
        return row;
      })
    );

    yield* notifyTaskChangedEffect(scopedCaseId, entityId ?? undefined);
    return toRecord(created);
  });
}

export function updateTaskEffect(
  input: UpdateTaskInput
): Effect.Effect<TaskRecord, DomainTag> {
  return Effect.gen(function* updateTaskGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(
      input.caseId,
      input.organizationId
    );
    const taskId = yield* requireTrimmedGraphId(input.taskId, "Task not found");
    const existing = yield* tryDb(() =>
      tasksRepo.getInCase(db, scopedCaseId, taskId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Task not found" });
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
    const statusChanged =
      input.status !== undefined && input.status !== existing.status;

    const updated = yield* transact((tx) =>
      Effect.gen(function* updateTaskTx() {
        if (statusChanged) {
          const locked = yield* tryDb(() =>
            casesRepo.lockById(tx, scopedCaseId)
          );
          if (!locked) {
            return yield* new NotFoundError({ resource: "Case not found" });
          }
        }
        const destStatus = input.status;
        const position =
          statusChanged && destStatus !== undefined
            ? yield* tryDb(() =>
                tasksRepo.nextPosition(tx, scopedCaseId, destStatus)
              )
            : undefined;
        const row = yield* tryDb(() =>
          tasksRepo.updateInCase(
            tx,
            scopedCaseId,
            taskId,
            buildTaskUpdateFields(input, dueDate, position, entityId)
          )
        );
        if (!row) {
          return yield* new InvalidError({ reason: "Failed to update Task" });
        }

        if (statusChanged) {
          yield* tryDb(() =>
            activityEventsRepo.create(tx, {
              caseId: scopedCaseId,
              kind: "task",
              action: "status_changed",
              subjectId: row.id,
              label: row.title,
              fromValue: existing.status,
              toValue: row.status,
              actorId: optionalActorId(input.actorId),
            })
          );
        }

        return row;
      })
    );

    yield* notifyTaskChangedEffect(
      scopedCaseId,
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
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedTaskId = yield* requireTrimmedGraphId(
      taskId,
      "Task not found"
    );
    const existing = yield* tryDb(() =>
      tasksRepo.getInCase(db, scopedCaseId, normalizedTaskId)
    );
    if (!existing) {
      return yield* new NotFoundError({ resource: "Task not found" });
    }

    const activityActor = optionalActorId(actorId);
    yield* transact((tx) =>
      Effect.gen(function* deleteTaskTx() {
        const ok = yield* tryDb(() =>
          tasksRepo.removeInCase(tx, scopedCaseId, normalizedTaskId)
        );
        if (!ok) {
          return yield* new InvalidError({
            reason: "Failed to delete Task",
          });
        }
        yield* tryDb(() =>
          activityEventsRepo.create(tx, {
            caseId: scopedCaseId,
            kind: "task",
            action: "deleted",
            subjectId: existing.id,
            label: existing.title,
            fromValue: existing.status,
            actorId: activityActor,
          })
        );
      })
    );

    yield* notifyTaskChangedEffect(
      scopedCaseId,
      existing.entityId ?? undefined
    );
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
        const locked = yield* tryDb(() => casesRepo.lockById(tx, scopedCaseId));
        if (!locked) {
          return yield* new NotFoundError({ resource: "Case not found" });
        }
        const rows = yield* tryDb(() =>
          tasksRepo.listForCase(tx, scopedCaseId, {
            status: input.status,
          })
        );
        const existing = new Set(rows.map((row) => row.id));
        if (orderedIds.length !== existing.size) {
          return yield* new InvalidError({
            reason: "Task order does not match the column",
          });
        }
        const seen = new Set<string>();
        for (const id of orderedIds) {
          if (!existing.has(id) || seen.has(id)) {
            return yield* new InvalidError({
              reason: "Task order does not match the column",
            });
          }
          seen.add(id);
        }
        yield* tryDb(() =>
          tasksRepo.rewriteOrder(tx, scopedCaseId, input.status, orderedIds)
        );
        const next = yield* tryDb(() =>
          tasksRepo.listForCase(tx, scopedCaseId, {
            status: input.status,
          })
        );
        return next.map(toRecord);
      })
    );

    yield* notifyTaskChangedEffect(scopedCaseId);
    return records;
  });
}
