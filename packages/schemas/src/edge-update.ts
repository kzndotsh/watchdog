import { z } from "zod";

import {
  optionalConfidenceTierSchema,
  optionalEdgePredicateSchema,
} from "./enums";
import { edgeScopeInputSchema } from "./graph-scope";
import {
  nullableTrimmedPatchSchema,
  optionalUuidSchema,
  uuidListSchema,
} from "./primitives";
import { edgeRelatedToHasNotes } from "./vocab";

/** Shared optional fields for edge PATCH (web forms + API + CLI). */
export const edgeUpdateFieldsSchema = z.object({
  viewEntityId: optionalUuidSchema,
  fromId: optionalUuidSchema,
  toId: optionalUuidSchema,
  predicate: optionalEdgePredicateSchema,
  confidence: optionalConfidenceTierSchema,
  notes: nullableTrimmedPatchSchema,
  evidenceIds: uuidListSchema.optional(),
});

/** Edge PATCH body including scope. */
export const updateEdgeInputSchema = edgeScopeInputSchema
  .extend(edgeUpdateFieldsSchema.shape)
  .refine(
    (v) =>
      (v.fromId === undefined && v.toId === undefined) ||
      (v.fromId !== undefined && v.toId !== undefined),
    { message: "fromId and toId must be sent together" }
  )
  .refine(
    (v) =>
      v.fromId === undefined || v.toId === undefined || v.fromId !== v.toId,
    { message: "fromId and toId must differ" }
  )
  .refine(
    (v) =>
      v.fromId !== undefined ||
      v.predicate !== undefined ||
      v.confidence !== undefined ||
      v.notes !== undefined ||
      v.evidenceIds !== undefined,
    { message: "At least one field is required" }
  )
  .refine(
    (v) =>
      v.predicate !== "related_to" ||
      v.notes === undefined ||
      edgeRelatedToHasNotes(v),
    { message: "related_to requires notes" }
  );

/** Edge DELETE body including scope. */
export const deleteEdgeInputSchema = edgeScopeInputSchema;

export type EdgeUpdateFields = z.output<typeof edgeUpdateFieldsSchema>;
export type UpdateEdgeInput = z.input<typeof updateEdgeInputSchema>;
export type DeleteEdgeInput = z.output<typeof deleteEdgeInputSchema>;
