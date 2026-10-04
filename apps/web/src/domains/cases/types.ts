import { z } from "zod";

import type { CaseRecord as CoreCaseRecord } from "@watchdog/core/cases";
import {
  type getCaseBySlugInputSchema,
  deleteCaseInputSchema,
  trimmedUuidSchema,
  type DeleteCaseInput,
} from "@watchdog/schemas";

export type CaseRecord = CoreCaseRecord;

export const getCaseByIdInputSchema = deleteCaseInputSchema;
export type GetCaseByIdInput = DeleteCaseInput;

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

/**
 * The route heal is a compare-and-set: `expectedActiveCaseId` is the Active Case the
 * client observed (null = none); the server writes only while the cookie still holds it.
 */
export const healActiveCaseInputSchema = z.object({
  caseId: trimmedUuidSchema,
  expectedActiveCaseId: trimmedUuidSchema.nullable(),
});
export type HealActiveCaseInput = z.output<typeof healActiveCaseInputSchema>;
