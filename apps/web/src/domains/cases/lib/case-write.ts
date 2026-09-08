import {
  updateCaseInputSchema,
  type UpdateCaseInput,
} from "@/domains/cases/types";

export interface UpdateCasePatch {
  name?: string;
  description?: string | null;
  allowThirdPartyEgress?: boolean;
}

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
