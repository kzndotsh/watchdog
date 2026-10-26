import { z } from "zod";

import { allowedEgressSchema } from "./egress-class";
import { trimmedCaseIdSchema } from "./ids";
import { NAME_MAX, NOTES_MAX } from "./limits";
import { pageInputFields } from "./pagination";
import {
  entitySlugSchema,
  nullableTextPatch,
  optionalText,
} from "./primitives";

/** Shared fields for case PATCH (web forms + API + CLI). */
export const updateCaseFieldsSchema = z.object({
  name: optionalText(NAME_MAX),
  description: nullableTextPatch(NOTES_MAX),
  allowedEgress: allowedEgressSchema.optional(),
});

/** Case PATCH body including scope. */
export const updateCaseInputSchema = z
  .object({
    caseId: trimmedCaseIdSchema,
  })
  .extend(updateCaseFieldsSchema.shape)
  .refine(
    (data) =>
      data.name !== undefined ||
      data.description !== undefined ||
      data.allowedEgress !== undefined,
    { message: "At least one field is required" }
  );

export const deleteCaseInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
});

/** The deletion policy; with a `caseId` it also counts the Jobs a delete of that Case would cancel. */
export const deletionPolicyInputSchema = z.object({
  caseId: trimmedCaseIdSchema.optional(),
});

/** The Case list: a page, ordered by name. */
export const listCasesInputSchema = z.object(pageInputFields);

/** Case lookup by slug (route param / server fn). */
export const getCaseBySlugInputSchema = z.object({
  caseSlug: entitySlugSchema,
});

export type UpdateCaseFields = z.output<typeof updateCaseFieldsSchema>;
export type UpdateCaseInput = z.output<typeof updateCaseInputSchema>;
export type ListCasesInput = z.output<typeof listCasesInputSchema>;
export type DeleteCaseInput = z.output<typeof deleteCaseInputSchema>;
export type GetCaseBySlugInput = z.output<typeof getCaseBySlugInputSchema>;
