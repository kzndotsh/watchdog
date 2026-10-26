import { z } from "zod";

import type {
  CaseRecord as CoreCaseRecord,
  DeletedCaseRecord as CoreDeletedCaseRecord,
  DeletionPolicy as CoreDeletionPolicy,
  RestoredCaseRecord as CoreRestoredCaseRecord,
} from "@watchdog/core/cases";
import {
  type getCaseBySlugInputSchema,
  deleteCaseInputSchema,
  type DeleteCaseInput,
} from "@watchdog/schemas/cases";
import { trimmedUuidSchema } from "@watchdog/schemas/shared";

export type CaseRecord = CoreCaseRecord;

/** What a run form needs of its Case to name an egress block and offer the fix. */
export type CaseEgress = Pick<CaseRecord, "allowedEgress" | "id" | "slug">;

/** A restored Case; `previousSlug` is set when its old link was taken and it got a new one. */
export type RestoredCaseRecord = CoreRestoredCaseRecord;

/** A deleted Case as owners and admins see it: who, when, and how long it can be restored. */
export type DeletedCaseRecord = CoreDeletedCaseRecord;
/** The restore window, whether the caller may delete, restore and purge Cases, and the Jobs a delete cancels. */
export type DeletionPolicy = CoreDeletionPolicy;

export const getCaseByIdInputSchema = deleteCaseInputSchema;
export type GetCaseByIdInput = DeleteCaseInput;

export type GetCaseBySlugInput = z.output<typeof getCaseBySlugInputSchema>;

/** Cases list + healed active Case (cookie). */
export type CasesContext = {
  cases: CaseRecord[];
  active: CaseRecord | null;
};

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
