import { z } from "zod";

import {
  entitySlugSchema,
  nullableTrimmedPatchSchema,
  optionalTrimmedSchema,
  trimmedUuidSchema,
} from "./primitives";

/** Shared fields for case PATCH (web forms + API + CLI). */
export const updateCaseFieldsSchema = z.object({
  name: optionalTrimmedSchema,
  description: nullableTrimmedPatchSchema,
  allowThirdPartyEgress: z.boolean().optional(),
});

/** Case PATCH body including scope. */
export const updateCaseInputSchema = z
  .object({
    caseId: trimmedUuidSchema,
  })
  .extend(updateCaseFieldsSchema.shape)
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.allowThirdPartyEgress !== undefined,
    { message: "At least one field is required" }
  );

export const deleteCaseInputSchema = z.object({
  caseId: trimmedUuidSchema,
});

/** Case lookup by slug (route param / server fn). */
export const getCaseBySlugInputSchema = z.object({
  caseSlug: entitySlugSchema,
});

export type UpdateCaseFields = z.output<typeof updateCaseFieldsSchema>;
export type UpdateCaseInput = z.output<typeof updateCaseInputSchema>;
export type DeleteCaseInput = z.output<typeof deleteCaseInputSchema>;
export type GetCaseBySlugInput = z.output<typeof getCaseBySlugInputSchema>;
