import { z } from "zod";

import { entityScopeInputSchema } from "./graph-scope";
import { NAME_MAX, NOTES_MAX } from "./limits";
import { optionalText, requiredText } from "./primitives";

/** Shared fields for timeline event POST (web forms + API + CLI). */
export const createEventFieldsSchema = z.object({
  when: requiredText(NAME_MAX),
  what: requiredText(NOTES_MAX),
  where: optionalText(NAME_MAX),
});

/** Timeline event POST body including entity scope. */
export const createEventInputSchema = entityScopeInputSchema.extend(
  createEventFieldsSchema.shape
);

export type CreateEventFields = z.output<typeof createEventFieldsSchema>;
export type CreateEventInput = z.output<typeof createEventInputSchema>;
