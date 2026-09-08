import { z } from "zod";

import {
  optionalTaskPrioritySchema,
  optionalTaskStatusSchema,
  taskPrioritySchema,
  taskStatusSchema,
  trimmedTaskStatusSchema,
} from "./enums";
import {
  nonEmptyTrimmed,
  nullableTrimmedPatchSchema,
  nullableUuidSchema,
  optionalDueDatePatchSchema,
  optionalTrimmedSchema,
  optionalUuidSchema,
  trimmedUuidSchema,
  uuidListSchema,
  uuidSchema,
} from "./primitives";

export const taskSchema = z.object({
  id: uuidSchema,
  caseId: uuidSchema,
  entityId: uuidSchema.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema.nullable(),
  dueDate: z.string().nullable(),
  position: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const taskFiltersSchema = z
  .object({
    caseId: trimmedUuidSchema,
    entityId: optionalUuidSchema,
    status: optionalTaskStatusSchema,
    unattachedOnly: z.boolean().optional(),
  })
  .refine(
    (filters) => !(filters.unattachedOnly && filters.entityId !== undefined),
    { message: "entityId and unattachedOnly are mutually exclusive" }
  );
export type TaskFiltersInput = z.output<typeof taskFiltersSchema>;

export const taskCreateInputSchema = z.object({
  caseId: trimmedUuidSchema,
  title: nonEmptyTrimmed,
  description: optionalTrimmedSchema,
  status: optionalTaskStatusSchema,
  priority: optionalTaskPrioritySchema.nullable().optional(),
  dueDate: optionalDueDatePatchSchema,
  entityId: nullableUuidSchema.optional(),
});
export type CreateTaskInput = z.output<typeof taskCreateInputSchema>;

export const taskUpdateInputSchema = z
  .object({
    caseId: trimmedUuidSchema,
    taskId: trimmedUuidSchema,
    title: nonEmptyTrimmed.optional(),
    description: nullableTrimmedPatchSchema,
    status: optionalTaskStatusSchema,
    priority: optionalTaskPrioritySchema.nullable().optional(),
    dueDate: optionalDueDatePatchSchema,
    entityId: nullableUuidSchema.optional(),
  })
  .refine(
    (data) =>
      data.title !== undefined ||
      data.description !== undefined ||
      data.status !== undefined ||
      data.priority !== undefined ||
      data.dueDate !== undefined ||
      data.entityId !== undefined,
    { message: "At least one field is required" }
  );
export type UpdateTaskInput = z.output<typeof taskUpdateInputSchema>;

export const taskDeleteInputSchema = z.object({
  caseId: trimmedUuidSchema,
  taskId: trimmedUuidSchema,
});
export type DeleteTaskInput = z.output<typeof taskDeleteInputSchema>;

export const taskIdInputSchema = z.object({
  caseId: trimmedUuidSchema,
  taskId: trimmedUuidSchema,
});

export const taskReorderInputSchema = z.object({
  caseId: trimmedUuidSchema,
  status: trimmedTaskStatusSchema,
  orderedIds: uuidListSchema.refine((ids) => ids.length > 0, {
    message: "orderedIds must not be empty",
  }),
});
export type ReorderTasksInput = z.output<typeof taskReorderInputSchema>;
