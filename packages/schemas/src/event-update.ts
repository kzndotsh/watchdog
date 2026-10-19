import { z } from "zod";

import { eventScopeInputSchema } from "./graph-scope";
import { NAME_MAX, NOTES_MAX } from "./limits";
import { nullableTextPatch, requiredText } from "./primitives";

/** Shared optional fields for timeline event PATCH (web forms + API + CLI). */
export const eventUpdateFieldsSchema = z.object({
  when: requiredText(NAME_MAX).optional(),
  what: requiredText(NOTES_MAX).optional(),
  where: nullableTextPatch(NAME_MAX),
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
