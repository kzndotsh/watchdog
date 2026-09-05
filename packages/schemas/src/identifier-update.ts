import { z } from "zod";

import {
  confidenceTierSchema,
  identifierStatusSchema,
  identifierTypeSchema,
} from "./enums";
import { uuidListSchema } from "./primitives";

/** Shared optional fields for identifier PATCH (web forms + API). */
export const identifierUpdateFieldsSchema = z.object({
  value: z.string().optional(),
  platform: z.string().optional(),
  type: identifierTypeSchema.optional(),
  status: identifierStatusSchema.optional(),
  confidence: confidenceTierSchema.optional(),
  notes: z.string().optional(),
  evidenceIds: uuidListSchema.optional(),
});

export type IdentifierUpdateFields = z.output<
  typeof identifierUpdateFieldsSchema
>;
