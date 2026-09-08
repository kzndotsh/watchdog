import { z } from "zod";

import { entityScopeInputSchema } from "./graph-scope";
import { nonEmptyTrimmed, optionalTrimmedSchema } from "./primitives";

/** Shared fields for timeline event POST (web forms + API + CLI). */
export const createEventFieldsSchema = z.object({
  when: nonEmptyTrimmed,
  what: nonEmptyTrimmed,
  where: optionalTrimmedSchema,
});

/** Timeline event POST body including entity scope. */
export const createEventInputSchema = entityScopeInputSchema.extend(
  createEventFieldsSchema.shape
);

export type CreateEventFields = z.output<typeof createEventFieldsSchema>;
export type CreateEventInput = z.output<typeof createEventInputSchema>;
