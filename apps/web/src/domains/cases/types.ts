import type { z } from "zod";

import type {
  getCaseBySlugInputSchema,
  DeleteCaseInput,
} from "@watchdog/domain/schemas/cases";
import type {
  DeletedCaseRecord as CoreDeletedCaseRecord,
  DeletionPolicy as CoreDeletionPolicy,
  RestoredCaseRecord as CoreRestoredCaseRecord,
} from "@watchdog/server/core/case-deletion";
import type {
  CaseCounts as CoreCaseCounts,
  CaseRecord as CoreCaseRecord,
} from "@watchdog/server/core/cases";

export type CaseRecord = CoreCaseRecord;

/** What a run form needs of its Case to name an egress block and offer the fix. */
export type CaseEgress = Pick<CaseRecord, "allowedEgress" | "id" | "slug">;

/** A restored Case; `previousSlug` is set when its old link was taken and it got a new one. */
export type RestoredCaseRecord = CoreRestoredCaseRecord;

/** A Case's tile counts: each exact below the list cap, capped above it. */
export type CaseCounts = CoreCaseCounts;
/** A deleted Case as owners and admins see it: who, when, and how long it can be restored. */
export type DeletedCaseRecord = CoreDeletedCaseRecord;
/** The restore window, whether the caller may delete, restore and purge Cases, and the Jobs a delete cancels. */
export type DeletionPolicy = CoreDeletionPolicy;

export type GetCaseByIdInput = DeleteCaseInput;

export type GetCaseBySlugInput = z.output<typeof getCaseBySlugInputSchema>;
