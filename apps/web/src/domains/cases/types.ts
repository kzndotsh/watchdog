import { z } from "zod";

import type { CaseRecord as CoreCaseRecord } from "@watchdog/core";
import {
  createCaseFieldsSchema,
  deleteCaseInputSchema,
  getCaseBySlugInputSchema,
  trimmedUuidSchema,
  updateCaseInputSchema,
  type DeleteCaseInput,
  type UpdateCaseInput,
} from "@watchdog/schemas";

export type CaseRecord = CoreCaseRecord;

export const getCaseByIdInputSchema = deleteCaseInputSchema;
export type GetCaseByIdInput = DeleteCaseInput;

export { getCaseBySlugInputSchema };
export type GetCaseBySlugInput = z.output<typeof getCaseBySlugInputSchema>;

/** Cases list + healed active Case (cookie). */
export interface CasesContext {
  cases: CaseRecord[];
  active: CaseRecord | null;
}

export const setActiveCaseIdInputSchema = z.object({
  caseId: z
    .union([trimmedUuidSchema, z.literal(""), z.null()])
    .transform((value) => (value === "" || value === null ? null : value)),
});
export type SetActiveCaseIdInput = z.output<typeof setActiveCaseIdInputSchema>;

export const createCaseInputSchema = createCaseFieldsSchema;
export type CreateCaseInput = z.input<typeof createCaseInputSchema>;

export { updateCaseInputSchema };
export type { UpdateCaseInput };

export { deleteCaseInputSchema };
export type { DeleteCaseInput };
