import { Effect } from "effect";

import { casesRepo, tasksRepo, type TaskRow } from "@watchdog/db";
import {
  dueDatePatchSchema,
  parseGraphUuidList,
  parseTrimmedUuid,
  trimmedOrNull,
  trimmedOrUndefined,
  type CaseId,
  type OrganizationId,
  type TaskPriority,
  type TaskStatus,
} from "@watchdog/schemas/shared";

import { appendActivityEffect } from "../activity/append";
import { optionalActorId } from "../actors/require-actor-id";
import {
  assertCaseInOrgEffect,
  assertEntityInCaseEffect,
  requireTrimmedGraphId,
} from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { tryDb, tryDbWith } from "../infra/postgres-effect";
import { transact } from "../infra/postgres-tx";
import {
  InternalError,
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
  caseId: CaseId;
  organizationId: OrganizationId;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority | null;
  dueDate?: string | null;
  entityId?: string | null;
  actorId?: string;
}

export interface UpdateTaskInput {
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

export function listTasksForCaseEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  opts?: ListTasksOpts
): Effect.Effect<TaskRecord[], DomainTag, Db> {
  return Effect.gen(function* listTasksGen() {
    let entityId: string | undefined;
    if (opts?.entityId === undefined) {
      entityId = undefined;
    } else {
      const parsed = parseTrimmedUuid(opts.entityId);
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
    const rows = yield* tryDbWith((exec) =>
      tasksRepo.listForCase(exec, scopedCaseId, {
        ...opts,
        entityId,
      })
    );
    return rows.map(toRecord);
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
    const row = yield* tryDbWith((exec) =>
      tasksRepo.getInCase(exec, scopedCaseId, normalizedTaskId)
    );
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
        const locked = yield* tryDb(() => casesRepo.lockById(tx, scopedCaseId));
        if (!locked) {
          return yield* new NotFoundError({ entity: "Case", id: scopedCaseId });
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
          return yield* new InternalError({ reason: "Failed to create Task" });
        }
        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "task",
          action: "created",
          subjectId: row.id,
          label: row.title,
          toValue: row.status,
          actorId: optionalActorId(input.actorId),
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
    const existing = yield* tryDbWith((exec) =>
      tasksRepo.getInCase(exec, scopedCaseId, taskId)
    );
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
        // Lock order is Case, then Task (as in reorder), so a status move
        // cannot deadlock a reorder. The Task row lock makes "did the status
        // change" atomic: the entry's `from_value` is the status this
        // transaction replaced, not the one read before it.
        if (input.status !== undefined) {
          const locked = yield* tryDb(() =>
            casesRepo.lockById(tx, scopedCaseId)
          );
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
            : yield* tryDb(() =>
                tasksRepo.lockInCase(tx, scopedCaseId, taskId)
              );
        if (input.status !== undefined && !current) {
          return yield* new NotFoundError({ entity: "Task", id: taskId });
        }
        const statusChanged =
          current !== null && input.status !== current.status;
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
              }
            : {
                caseId: scopedCaseId,
                kind: "task",
                action: "updated",
                subjectId: row.id,
                label: row.title,
                actorId: optionalActorId(input.actorId),
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
  actorId?: string
): Effect.Effect<void, DomainTag, Db> {
  return Effect.gen(function* deleteTaskGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const normalizedTaskId = yield* requireTrimmedGraphId(taskId, "Task");
    const existing = yield* tryDbWith((exec) =>
      tasksRepo.getInCase(exec, scopedCaseId, normalizedTaskId)
    );
    if (!existing) {
      return yield* new NotFoundError({ entity: "Task", id: normalizedTaskId });
    }

    const activityActor = optionalActorId(actorId);
    yield* transact((tx) =>
      Effect.gen(function* deleteTaskTx() {
        const deleted = yield* tryDb(() =>
          tasksRepo.removeInCase(tx, scopedCaseId, normalizedTaskId)
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
        });
      })
    );
  });
}

export interface ReorderTasksInput {
  caseId: CaseId;
  organizationId: OrganizationId;
  status: TaskStatus;
  orderedIds: string[];
}

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
        const locked = yield* tryDb(() => casesRepo.lockById(tx, scopedCaseId));
        if (!locked) {
          return yield* new NotFoundError({ entity: "Case", id: scopedCaseId });
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
        yield* appendActivityEffect(tx, {
          caseId: scopedCaseId,
          kind: "task",
          action: "reordered",
          toValue: input.status,
        });
        return next.map(toRecord);
      })
    );

    return records;
  });
}
