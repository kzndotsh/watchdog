import { z } from "zod";

import { eventScopeInputSchema } from "./graph-scope";
import { nonEmptyTrimmed, nullableTrimmedPatchSchema } from "./primitives";

/** Shared optional fields for timeline event PATCH (web forms + API + CLI). */
export const eventUpdateFieldsSchema = z.object({
  when: nonEmptyTrimmed.optional(),
  what: nonEmptyTrimmed.optional(),
  where: nullableTrimmedPatchSchema,
});

/** Timeline event PATCH body including scope. */
export const updateEventInputSchema = eventScopeInputSchema
  .extend(eventUpdateFieldsSchema.shape)
  .refine(
    (data) =>
      data.when !== undefined ||
      data.what !== undefined ||
      data.where !== undefined,
    { message: "At least one field is required" }
  );

export type EventUpdateFields = z.output<typeof eventUpdateFieldsSchema>;
export type UpdateEventInput = z.output<typeof updateEventInputSchema>;
