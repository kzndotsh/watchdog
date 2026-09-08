import { z } from "zod";

import {
  trimmedConfidenceTierSchema,
  trimmedEdgePredicateSchema,
} from "./enums";
import {
  optionalTrimmedSchema,
  optionalUuidSchema,
  trimmedUuidSchema,
  uuidListSchema,
} from "./primitives";
import { edgeRelatedToHasNotes } from "./vocab";

const createEdgeFieldsBase = z.object({
  fromId: trimmedUuidSchema,
  toId: trimmedUuidSchema,
  predicate: trimmedEdgePredicateSchema,
  confidence: trimmedConfidenceTierSchema,
  notes: optionalTrimmedSchema,
  evidenceIds: uuidListSchema.optional(),
  viewEntityId: optionalUuidSchema,
});

type CreateEdgeFieldsBase = z.infer<typeof createEdgeFieldsBase>;

function withCreateEdgeFieldRefinements<
  T extends z.ZodType<CreateEdgeFieldsBase>,
>(schema: T) {
  return schema
    .refine(edgeRelatedToHasNotes, {
      message: "related_to requires notes",
    })
    .refine((v) => v.fromId !== v.toId, {
      message: "fromId and toId must differ",
    });
}

/** Shared fields for edge POST (web forms + API + CLI). */
export const createEdgeFieldsSchema =
  withCreateEdgeFieldRefinements(createEdgeFieldsBase);

/** Edge POST body including case scope. */
export const createEdgeInputSchema = withCreateEdgeFieldRefinements(
  createEdgeFieldsBase.extend({ caseId: trimmedUuidSchema })
);

export type CreateEdgeFields = z.output<typeof createEdgeFieldsSchema>;
export type CreateEdgeInput = z.output<typeof createEdgeInputSchema>;
