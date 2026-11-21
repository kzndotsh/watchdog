import {
  updateCaseInputSchema,
  type UpdateCaseInput,
} from "@watchdog/domain/schemas/cases";
import type { EgressClass } from "@watchdog/domain/schemas/shared";

export type UpdateCasePatch = {
  name?: string;
  description?: string | null;
  allowedEgress?: readonly EgressClass[];
};

/** Normalize case PATCH payloads at ingress. */
export function buildUpdateCaseData(
  caseId: string,
  patch: UpdateCasePatch
): UpdateCaseInput {
  return updateCaseInputSchema.parse({
    caseId,
    ...patch,
  });
}
